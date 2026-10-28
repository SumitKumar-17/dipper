package db

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"

	"dipper/protocol"
)

// Options that route a connection through an SSH server, for a database that only the bastion host
// can reach. They hold a host, a user, a key path and a public fingerprint, never a secret: the
// private key stays in its file, or in the agent.
const (
	optSSHHost        = "ssh_host"
	optSSHPort        = "ssh_port"
	optSSHUser        = "ssh_user"
	optSSHKey         = "ssh_key"
	optSSHFingerprint = "ssh_fingerprint"
)

// sshDialerSeq numbers the MySQL dialer registrations, which are global and have no way to be removed.
var sshDialerSeq atomic.Uint64

type sshSettings struct {
	host, user, keyPath, fingerprint string
	port                             int
}

// sshSettingsFor reads the SSH options, returning nil when the connection is not tunnelled.
func sshSettingsFor(config protocol.ConnectionConfig) (*sshSettings, error) {
	host := optionString(config, optSSHHost)
	if host == "" {
		return nil, nil
	}
	s := &sshSettings{host: host, port: 22, user: optionString(config, optSSHUser), fingerprint: optionString(config, optSSHFingerprint)}
	if raw := optionString(config, optSSHPort); raw != "" {
		port, err := strconv.Atoi(raw)
		if err != nil || port < 1 || port > 65535 {
			return nil, fmt.Errorf("%s must be a port number", optSSHPort)
		}
		s.port = port
	}
	if s.user == "" {
		s.user = config.User
	}
	var err error
	if s.keyPath, err = certFile(config, optSSHKey); err != nil {
		return nil, err
	}
	if s.fingerprint != "" && !strings.HasPrefix(s.fingerprint, "SHA256:") {
		return nil, fmt.Errorf("%s looks like SHA256:..., as ssh-keygen -lf prints it", optSSHFingerprint)
	}
	return s, nil
}

// sshTunnel dials through one SSH connection, opened on first use and opened again if it dies. It
// is a dialer rather than a local listener, so there is no port to leak and nothing for another
// process on the machine to connect to.
type sshTunnel struct {
	settings sshSettings
	mu       sync.Mutex
	client   *ssh.Client
}

func newSSHTunnel(settings sshSettings) *sshTunnel { return &sshTunnel{settings: settings} }

func (t *sshTunnel) authMethods() ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod
	paths := []string{}
	if t.settings.keyPath != "" {
		paths = append(paths, t.settings.keyPath)
	}
	var keyErr error
	for _, path := range paths {
		pem, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		signer, err := ssh.ParsePrivateKey(pem)
		var missing *ssh.PassphraseMissingError
		if errors.As(err, &missing) {
			keyErr = fmt.Errorf("%s is protected by a passphrase; add it to ssh-agent with ssh-add and dipper will use the agent", optSSHKey)
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("%s is not a private key: %w", optSSHKey, err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if socket := os.Getenv("SSH_AUTH_SOCK"); socket != "" {
		if conn, err := net.Dial("unix", socket); err == nil {
			methods = append(methods, ssh.PublicKeysCallback(agent.NewClient(conn).Signers))
		}
	}
	if len(methods) == 0 {
		if keyErr != nil {
			return nil, keyErr
		}
		return nil, errors.New("no SSH key: set ssh_key to a private key file, or run ssh-agent with a key added")
	}
	return methods, nil
}

// hostKeyCallback checks the server against a pinned fingerprint when one is set, and against
// ~/.ssh/known_hosts otherwise. Neither passing is a refusal, never a silent trust: a tunnel to an
// unverified host hands every query and password to whoever answers.
func (t *sshTunnel) hostKeyCallback() (ssh.HostKeyCallback, error) {
	if t.settings.fingerprint != "" {
		want := t.settings.fingerprint
		return func(_ string, _ net.Addr, key ssh.PublicKey) error {
			if got := ssh.FingerprintSHA256(key); got != want {
				return fmt.Errorf("the SSH server's key is %s, not the pinned %s", got, want)
			}
			return nil
		}, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	known := filepath.Join(home, ".ssh", "known_hosts")
	check, err := knownhosts.New(known)
	if err != nil {
		return nil, fmt.Errorf("cannot read %s: connect with ssh once to trust the host, or set %s", known, optSSHFingerprint)
	}
	return func(host string, remote net.Addr, key ssh.PublicKey) error {
		err := check(host, remote, key)
		var keyErr *knownhosts.KeyError
		if errors.As(err, &keyErr) && len(keyErr.Want) == 0 {
			return fmt.Errorf("the SSH server's key %s is not in known_hosts; if you trust it, set %s to that value", ssh.FingerprintSHA256(key), optSSHFingerprint)
		}
		return err
	}, nil
}

func (t *sshTunnel) connect(ctx context.Context) (*ssh.Client, error) {
	auth, err := t.authMethods()
	if err != nil {
		return nil, err
	}
	callback, err := t.hostKeyCallback()
	if err != nil {
		return nil, err
	}
	config := &ssh.ClientConfig{User: t.settings.user, Auth: auth, HostKeyCallback: callback, Timeout: connectTimeout}
	address := net.JoinHostPort(t.settings.host, strconv.Itoa(t.settings.port))
	raw, err := (&net.Dialer{Timeout: connectTimeout}).DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	conn, channels, requests, err := ssh.NewClientConn(raw, address, config)
	if err != nil {
		_ = raw.Close()
		return nil, err
	}
	return ssh.NewClient(conn, channels, requests), nil
}

// DialContext opens a connection to addr as the SSH server sees it. If the SSH connection has died
// since last use, one fresh attempt is made before the error is reported.
func (t *sshTunnel) DialContext(ctx context.Context, _ string, addr string) (net.Conn, error) {
	for attempt := 0; ; attempt++ {
		client, err := t.session(ctx)
		if err != nil {
			return nil, err
		}
		conn, err := dialVia(ctx, client, addr)
		if err == nil || attempt > 0 {
			return conn, err
		}
		t.drop(client)
	}
}

func (t *sshTunnel) session(ctx context.Context) (*ssh.Client, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.client == nil {
		client, err := t.connect(ctx)
		if err != nil {
			return nil, err
		}
		t.client = client
	}
	return t.client, nil
}

func (t *sshTunnel) drop(client *ssh.Client) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.client == client {
		t.client = nil
	}
	_ = client.Close()
}

func (t *sshTunnel) Close() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.client == nil {
		return nil
	}
	err := t.client.Close()
	t.client = nil
	return err
}

// dialVia is client.Dial that gives up when ctx does, which the library's own call cannot.
func dialVia(ctx context.Context, client *ssh.Client, addr string) (net.Conn, error) {
	type result struct {
		conn net.Conn
		err  error
	}
	done := make(chan result, 1)
	go func() {
		conn, err := client.Dial("tcp", addr)
		done <- result{conn, err}
	}()
	select {
	case r := <-done:
		return r.conn, r.err
	case <-ctx.Done():
		go func() {
			if r := <-done; r.conn != nil {
				_ = r.conn.Close()
			}
		}()
		return nil, ctx.Err()
	}
}
