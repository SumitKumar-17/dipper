package db

import (
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"dipper/protocol"
)

// Options that refine how a connection is made. They hold file paths and a schema list, never a
// secret, which is why they may live in Options and travel back to the UI.
const (
	optRootCert   = "sslrootcert"
	optClientCert = "sslcert"
	optClientKey  = "sslkey"
	optSearchPath = "search_path"
	optSocket     = "socket"
)

// A search_path is a comma separated list of schema names, each bare or double quoted. Nothing else
// is a schema list, so anything else is refused rather than sent to the server as a setting.
var searchPathPattern = regexp.MustCompile(`^[A-Za-z0-9_$", ]+$`)

func optionString(config protocol.ConnectionConfig, key string) string {
	value, _ := config.Options[key].(string)
	return strings.TrimSpace(value)
}

// certFile checks a certificate path the server is to read: absolute, so it does not depend on
// where dipper was started, and present, so a typo is named here rather than surfacing as a TLS
// handshake failure.
func certFile(config protocol.ConnectionConfig, key string) (string, error) {
	path := optionString(config, key)
	if path == "" {
		return "", nil
	}
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("%s must be an absolute path", key)
	}
	if info, err := os.Stat(path); err != nil || info.IsDir() {
		return "", fmt.Errorf("%s: no file at %s", key, path)
	}
	return path, nil
}

// certFiles reads the three TLS options. A client certificate needs its key and the reverse, so a
// half pair is an error rather than a connection that fails later without saying why.
func certFiles(config protocol.ConnectionConfig) (root, cert, key string, err error) {
	if root, err = certFile(config, optRootCert); err != nil {
		return
	}
	if cert, err = certFile(config, optClientCert); err != nil {
		return
	}
	if key, err = certFile(config, optClientKey); err != nil {
		return
	}
	if (cert == "") != (key == "") {
		err = errors.New("a client certificate needs both sslcert and sslkey")
	}
	return
}

// searchPathFor returns the validated search_path option, empty when none was set.
func searchPathFor(config protocol.ConnectionConfig) (string, error) {
	value := optionString(config, optSearchPath)
	if value != "" && !searchPathPattern.MatchString(value) {
		return "", fmt.Errorf("%s is a comma separated list of schema names", optSearchPath)
	}
	return value, nil
}

// socketFor returns the unix socket path of a connection, from the socket option or, for Postgres,
// a host that is a directory.
func socketFor(config protocol.ConnectionConfig) (string, error) {
	path := optionString(config, optSocket)
	if path == "" && config.Dialect == protocol.DialectPostgres && strings.HasPrefix(config.Host, "/") {
		path = config.Host
	}
	if path != "" && !filepath.IsAbs(path) {
		return "", errors.New("socket must be an absolute path")
	}
	return path, nil
}

// tlsConfigFor builds the TLS settings MySQL needs when a private CA or a client certificate is in
// play, which its driver's plain "true" and "skip-verify" cannot express. It returns nil when
// neither is configured.
func tlsConfigFor(config protocol.ConnectionConfig, verify bool) (*tls.Config, error) {
	root, cert, key, err := certFiles(config)
	if err != nil {
		return nil, err
	}
	if root == "" && cert == "" {
		return nil, nil
	}
	out := &tls.Config{ServerName: strings.Trim(config.Host, "[]"), InsecureSkipVerify: !verify}
	if root != "" {
		pem, err := os.ReadFile(root)
		if err != nil {
			return nil, err
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("%s holds no PEM certificate", optRootCert)
		}
		out.RootCAs = pool
	}
	if cert != "" {
		pair, err := tls.LoadX509KeyPair(cert, key)
		if err != nil {
			return nil, fmt.Errorf("client certificate: %w", err)
		}
		out.Certificates = []tls.Certificate{pair}
	}
	return out, nil
}

// tlsName is the registration name for a TLS config, stable for the same files so reconnecting
// does not pile up registrations.
func tlsName(config protocol.ConnectionConfig) string {
	sum := sha256.Sum256([]byte(config.Host + "\x00" + optionString(config, optRootCert) + "\x00" +
		optionString(config, optClientCert) + "\x00" + optionString(config, optClientKey)))
	return "dipper-" + hex.EncodeToString(sum[:8])
}
