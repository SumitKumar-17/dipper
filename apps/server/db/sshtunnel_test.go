package db

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"dipper/protocol"
)

// fakeBastion is an SSH server that accepts one client key and forwards direct-tcpip channels,
// which is all a database tunnel asks of a bastion host.
type fakeBastion struct {
	addr        string
	hostKey     ssh.PublicKey
	fingerprint string
}

func startBastion(t *testing.T, clientKey ssh.PublicKey) *fakeBastion {
	t.Helper()
	_, hostPriv, _ := ed25519.GenerateKey(rand.Reader)
	hostSigner, err := ssh.NewSignerFromKey(hostPriv)
	if err != nil {
		t.Fatal(err)
	}
	config := &ssh.ServerConfig{PublicKeyCallback: func(_ ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
		if string(key.Marshal()) == string(clientKey.Marshal()) {
			return nil, nil
		}
		return nil, io.EOF
	}}
	config.AddHostKey(hostSigner)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	go func() {
		for {
			raw, err := listener.Accept()
			if err != nil {
				return
			}
			go serveBastion(raw, config)
		}
	}()
	return &fakeBastion{addr: listener.Addr().String(), hostKey: hostSigner.PublicKey(), fingerprint: ssh.FingerprintSHA256(hostSigner.PublicKey())}
}

func serveBastion(raw net.Conn, config *ssh.ServerConfig) {
	conn, channels, requests, err := ssh.NewServerConn(raw, config)
	if err != nil {
		return
	}
	defer conn.Close()
	go ssh.DiscardRequests(requests)
	for request := range channels {
		if request.ChannelType() != "direct-tcpip" {
			_ = request.Reject(ssh.UnknownChannelType, "only forwarding")
			continue
		}
		var target struct {
			Host       string
			Port       uint32
			OriginHost string
			OriginPort uint32
		}
		if err := ssh.Unmarshal(request.ExtraData(), &target); err != nil {
			_ = request.Reject(ssh.ConnectionFailed, "bad request")
			continue
		}
		out, err := net.Dial("tcp", net.JoinHostPort(target.Host, strconv.Itoa(int(target.Port))))
		if err != nil {
			_ = request.Reject(ssh.ConnectionFailed, err.Error())
			continue
		}
		channel, reqs, _ := request.Accept()
		go ssh.DiscardRequests(reqs)
		go func() { _, _ = io.Copy(channel, out); _ = channel.Close() }()
		go func() { _, _ = io.Copy(out, channel); _ = out.Close() }()
	}
}

// echoServer answers every line with the same line, upper-cased, so the test can tell a real round
// trip through the tunnel from a connection that merely opened.
func echoServer(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				buf := make([]byte, 64)
				n, _ := conn.Read(buf)
				_, _ = conn.Write([]byte(strings.ToUpper(string(buf[:n]))))
			}()
		}
	}()
	return listener.Addr().String()
}

func writeKey(t *testing.T) (string, ssh.PublicKey) {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	block, err := ssh.MarshalPrivateKey(priv, "")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "id_ed25519")
	if err := os.WriteFile(path, pem.EncodeToMemory(block), 0o600); err != nil {
		t.Fatal(err)
	}
	sshPub, _ := ssh.NewPublicKey(pub)
	return path, sshPub
}

func tunnelConfig(bastion *fakeBastion, keyPath, fingerprint string) protocol.ConnectionConfig {
	host, port, _ := net.SplitHostPort(bastion.addr)
	options := map[string]any{optSSHHost: host, optSSHPort: port, optSSHUser: "dipper", optSSHKey: keyPath}
	if fingerprint != "" {
		options[optSSHFingerprint] = fingerprint
	}
	return protocol.ConnectionConfig{Dialect: protocol.DialectPostgres, Options: options}
}

func roundTrip(t *testing.T, tunnel *sshTunnel, target string) (string, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, err := tunnel.DialContext(ctx, "tcp", target)
	if err != nil {
		return "", err
	}
	defer conn.Close()
	_, _ = conn.Write([]byte("hello"))
	buf := make([]byte, 16)
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	n, err := conn.Read(buf)
	return string(buf[:n]), err
}

func TestTunnelReachesAServiceOnlyTheBastionSees(t *testing.T) {
	keyPath, clientPub := writeKey(t)
	bastion := startBastion(t, clientPub)
	target := echoServer(t)

	tunnel, err := tunnelFor(tunnelConfig(bastion, keyPath, bastion.fingerprint))
	if err != nil || tunnel == nil {
		t.Fatalf("tunnelFor: %v %v", tunnel, err)
	}
	defer tunnel.Close()
	got, err := roundTrip(t, tunnel, target)
	if err != nil || got != "HELLO" {
		t.Fatalf("round trip = %q, %v; want HELLO", got, err)
	}
	// The same SSH connection serves the next dial.
	if got, err := roundTrip(t, tunnel, target); err != nil || got != "HELLO" {
		t.Fatalf("second round trip = %q, %v", got, err)
	}
}

func TestTunnelRefusesAHostWhoseKeyIsNotTheOnePinned(t *testing.T) {
	keyPath, clientPub := writeKey(t)
	bastion := startBastion(t, clientPub)
	tunnel, _ := tunnelFor(tunnelConfig(bastion, keyPath, "SHA256:notTheRealFingerprintAtAllxxxxxxxxxxxxxxxx"))
	defer tunnel.Close()
	_, err := roundTrip(t, tunnel, echoServer(t))
	if err == nil || !strings.Contains(err.Error(), "not the pinned") {
		t.Fatalf("a wrong fingerprint must be refused, got %v", err)
	}
}

func TestTunnelNamesTheKeyOfAnUnknownHost(t *testing.T) {
	t.Setenv("HOME", t.TempDir()) // no ~/.ssh/known_hosts at all
	keyPath, clientPub := writeKey(t)
	bastion := startBastion(t, clientPub)
	tunnel, _ := tunnelFor(tunnelConfig(bastion, keyPath, ""))
	defer tunnel.Close()
	_, err := roundTrip(t, tunnel, echoServer(t))
	if err == nil || !strings.Contains(err.Error(), "known_hosts") {
		t.Fatalf("an unverifiable host must be refused with a way forward, got %v", err)
	}

	// With a known_hosts file that lacks the host, the message carries the fingerprint to pin.
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(home, ".ssh"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".ssh", "known_hosts"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	tunnel2, _ := tunnelFor(tunnelConfig(bastion, keyPath, ""))
	defer tunnel2.Close()
	_, err = roundTrip(t, tunnel2, echoServer(t))
	if err == nil || !strings.Contains(err.Error(), bastion.fingerprint) {
		t.Fatalf("the error should name the fingerprint %s, got %v", bastion.fingerprint, err)
	}
}

func TestTunnelRejectsAKeyTheServerDoesNotKnow(t *testing.T) {
	_, someoneElse := writeKey(t)
	keyPath, _ := writeKey(t)
	bastion := startBastion(t, someoneElse)
	tunnel, _ := tunnelFor(tunnelConfig(bastion, keyPath, bastion.fingerprint))
	defer tunnel.Close()
	if _, err := roundTrip(t, tunnel, echoServer(t)); err == nil {
		t.Fatal("a key the server does not accept must not connect")
	}
}

func TestSSHSettingsValidation(t *testing.T) {
	none, err := sshSettingsFor(protocol.ConnectionConfig{})
	if err != nil || none != nil {
		t.Fatalf("no ssh_host means no tunnel: %v %v", none, err)
	}
	cases := map[string]map[string]any{
		"bad port":        {optSSHHost: "h", optSSHPort: "99999"},
		"relative key":    {optSSHHost: "h", optSSHKey: "id_rsa"},
		"missing key":     {optSSHHost: "h", optSSHKey: "/nope/id_rsa"},
		"bad fingerprint": {optSSHHost: "h", optSSHFingerprint: "abc"},
	}
	for name, options := range cases {
		if _, err := sshSettingsFor(protocol.ConnectionConfig{Options: options}); err == nil {
			t.Errorf("%s should be refused", name)
		}
	}
	s, _ := sshSettingsFor(protocol.ConnectionConfig{User: "dbuser", Options: map[string]any{optSSHHost: "h"}})
	if s.port != 22 || s.user != "dbuser" {
		t.Errorf("defaults are port 22 and the database user: %+v", s)
	}
}
