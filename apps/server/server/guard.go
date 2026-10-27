package server

import (
	"net"
	"net/http"
	"net/url"
	"strings"

	"dipper/httpx"
)

// The API has no login, so the network position is the only access control. A web page in the
// user's own browser can still reach 127.0.0.1, which is why every /api/ request is checked twice:
// the Host header (a rebinding attack arrives under the attacker's domain name) and the Origin
// header (a cross-site form post carries the attacker's origin).

var loopbackHosts = map[string]bool{"localhost": true, "127.0.0.1": true, "::1": true}

// guard rejects /api/ requests that did not come from this app or its allow-listed dev origin.
func (s *Server) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") && !s.admits(r) {
			httpx.WriteError(w, httpx.Forbidden("request refused: unexpected host or origin"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) admits(r *http.Request) bool {
	if s.loopbackOnly && !loopbackHosts[hostName(r.Host)] {
		return false
	}
	origin := r.Header.Get("Origin")
	if origin == "" || s.originAllowed(origin) {
		return true
	}
	return sameHost(origin, r.Host)
}

func (s *Server) originAllowed(origin string) bool {
	for _, allowed := range s.allowOrigins {
		if allowed == origin {
			return true
		}
	}
	return false
}

// sameHost compares an Origin header with the Host the request was addressed to.
func sameHost(origin, host string) bool {
	parsed, err := url.Parse(origin)
	return err == nil && strings.EqualFold(parsed.Host, host)
}

// hostName strips the port and the brackets of an IPv6 literal from a Host header value.
func hostName(host string) string {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.ToLower(strings.Trim(host, "[]"))
}
