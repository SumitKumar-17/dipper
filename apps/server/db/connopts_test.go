package db

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dipper/protocol"
)

func withOptions(options map[string]any) protocol.ConnectionConfig {
	return protocol.ConnectionConfig{Dialect: protocol.DialectPostgres, Host: "db.example.com", Options: options}
}

func TestSearchPath(t *testing.T) {
	for _, ok := range []string{"", "app", `"$user", public`, "a,b"} {
		if _, err := searchPathFor(withOptions(map[string]any{optSearchPath: ok})); err != nil {
			t.Errorf("%q should be accepted: %v", ok, err)
		}
	}
	for _, bad := range []string{"public; drop table x", "a--b", "a b;c", "x'y"} {
		if _, err := searchPathFor(withOptions(map[string]any{optSearchPath: bad})); err == nil {
			t.Errorf("%q should be refused", bad)
		}
	}
}

func TestCertFiles(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "ca.pem")
	if err := os.WriteFile(file, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := certFiles(withOptions(map[string]any{optRootCert: file})); err != nil {
		t.Errorf("an existing absolute path is fine: %v", err)
	}
	cases := map[string]map[string]any{
		"absolute":  {optRootCert: "ca.pem"},
		"no file":   {optRootCert: filepath.Join(dir, "missing.pem")},
		"directory": {optRootCert: dir},
		"both":      {optClientCert: file},
	}
	for name, options := range cases {
		if _, _, _, err := certFiles(withOptions(options)); err == nil {
			t.Errorf("%s: should be refused", name)
		}
	}
}

func TestSocketFor(t *testing.T) {
	pg := protocol.ConnectionConfig{Dialect: protocol.DialectPostgres, Host: "/var/run/postgresql"}
	if got, err := socketFor(pg); err != nil || got != "/var/run/postgresql" {
		t.Errorf("a path host is a socket directory: %q %v", got, err)
	}
	my := protocol.ConnectionConfig{Dialect: protocol.DialectMySQL, Host: "x", Options: map[string]any{optSocket: "/tmp/mysql.sock"}}
	if got, _ := socketFor(my); got != "/tmp/mysql.sock" {
		t.Errorf("socket option: %q", got)
	}
	my.Options[optSocket] = "relative.sock"
	if _, err := socketFor(my); err == nil || !strings.Contains(err.Error(), "absolute") {
		t.Errorf("a relative socket should be refused: %v", err)
	}
	if got, _ := socketFor(withOptions(nil)); got != "" {
		t.Errorf("an ordinary host has no socket: %q", got)
	}
}

func TestSocketHostIsLoopback(t *testing.T) {
	if !isLoopback("/var/run/postgresql") {
		t.Error("a socket directory is this machine")
	}
}
