// Package storage owns everything pipit keeps on disk. One directory holds all of it (default
// ~/.pipit, override with PIPIT_HOME): connections.json (0600), settings.json, history.db,
// server.json, update.json, plus queries/, the workspace created on first run.
package storage

import (
	"os"
	"path/filepath"
)

const (
	ConnectionsFile = "connections.json"
	SettingsFile    = "settings.json"
	HistoryFile     = "history.db"
	// The JSONL history this replaced. Read once, then renamed; see importLegacyHistory.
	legacyHistoryFile = "history.jsonl"
	ServerInfoFile    = "server.json"
	UpdateCheckFile   = "update.json"
	QueriesDirName    = "queries"
)

func ConfigDir() string {
	if dir := os.Getenv("PIPIT_HOME"); dir != "" {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ".pipit"
	}
	return filepath.Join(home, ".pipit")
}

// DefaultQueriesDir is the workspace root created on first run, where .sql files live by default.
func DefaultQueriesDir() string {
	return filepath.Join(ConfigDir(), QueriesDirName)
}

func EnsureDir() (string, error) {
	dir := ConfigDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func ConfigFile(name string) string {
	return filepath.Join(ConfigDir(), name)
}
