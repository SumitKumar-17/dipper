package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func admitsRequest(s *Server, host, origin string) bool {
	r := httptest.NewRequest(http.MethodPost, "/api/query", nil)
	r.Host = host
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	return s.admits(r)
}

func TestGuardAdmits(t *testing.T) {
	s := &Server{loopbackOnly: true, allowOrigins: []string{"http://localhost:5173"}}
	cases := []struct {
		name         string
		host, origin string
		want         bool
	}{
		{"same origin", "127.0.0.1:4600", "http://127.0.0.1:4600", true},
		{"no origin header", "localhost:4600", "", true},
		{"ipv6 loopback", "[::1]:4600", "", true},
		{"dev origin", "localhost:4600", "http://localhost:5173", true},
		{"rebinding host", "evil.example:4600", "http://evil.example:4600", false},
		{"cross site post", "127.0.0.1:4600", "https://evil.example", false},
	}
	for _, c := range cases {
		if got := admitsRequest(s, c.host, c.origin); got != c.want {
			t.Errorf("%s: admits = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestGuardOpenHostSkipsHostCheck(t *testing.T) {
	s := &Server{loopbackOnly: false}
	if !admitsRequest(s, "db-box.lan:4600", "") {
		t.Error("a deliberately exposed server must accept its own hostname")
	}
}
