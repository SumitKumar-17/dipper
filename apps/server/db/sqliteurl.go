package db

import (
	"errors"
	"net/url"
	"regexp"
	"strings"

	"dipper/protocol"
)

var sqliteSchemes = []string{"sqlite3://", "sqlite://", "sqlite3:", "sqlite:", "file:"}

var windowsDrivePath = regexp.MustCompile(`^/[A-Za-z]:`)

// sqlitePathFromURL recognises sqlite://, sqlite: and file: URLs and returns what follows the
// scheme. They are cut by hand rather than parsed with net/url because the "host" of
// sqlite://data.db is really the first segment of a relative file, and :memory: and Windows
// drive letters are not valid hosts.
func sqlitePathFromURL(raw string) (string, bool) {
	lower := strings.ToLower(raw)
	for _, scheme := range sqliteSchemes {
		if !strings.HasPrefix(lower, scheme) {
			continue
		}
		rest := raw[len(scheme):]
		if scheme == "file:" {
			// file:///abs/path is the URI form of /abs/path; file:rel.db is a relative path.
			rest = strings.TrimPrefix(rest, "//")
			if windowsDrivePath.MatchString(rest) {
				rest = rest[1:]
			}
		}
		return rest, true
	}
	return "", false
}

// sqliteConfigFromPath builds the config from a path with an optional query string. Only mode=ro
// is honoured, because it is the one parameter that means "never write", which the connection's
// own read-only guard can say too.
func sqliteConfigFromPath(rest string) (protocol.ConnectionConfig, error) {
	path, rawQuery, _ := strings.Cut(rest, "?")
	if decoded, err := url.PathUnescape(path); err == nil {
		path = decoded
	}
	if strings.TrimSpace(path) == "" {
		return protocol.ConnectionConfig{}, errors.New("a sqlite connection url needs a file path, e.g. sqlite:///home/me/app.db")
	}
	query, _ := url.ParseQuery(rawQuery)
	return protocol.ConnectionConfig{
		Dialect:  protocol.DialectSQLite,
		Database: path,
		ReadOnly: strings.EqualFold(query.Get("mode"), "ro"),
	}, nil
}
