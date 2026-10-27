package server

import (
	"testing"

	"dipper/protocol"
)

func str(s string) *string { return &s }
func flag(b bool) *bool    { return &b }

func TestConnectionSafetyFlagsAreStoredAndValidated(t *testing.T) {
	config, err := connectionFromBody(connectionBody{Name: str("prod"), Color: str("red"), ReadOnly: flag(true)}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if config.Color != "red" || !config.ReadOnly {
		t.Errorf("flags not stored: %+v", config)
	}
	if _, err := connectionFromBody(connectionBody{Name: str("x"), Color: str("purple")}, nil); err == nil {
		t.Error("an unknown colour must be refused")
	}
}

func TestAnUpdateWithoutFlagsLeavesThemAlone(t *testing.T) {
	existing := protocol.ConnectionConfig{Name: "prod", Color: "red", ReadOnly: true}
	config, err := connectionFromBody(connectionBody{Host: str("db.internal")}, &existing)
	if err != nil {
		t.Fatal(err)
	}
	if config.Color != "red" || !config.ReadOnly {
		t.Errorf("an edit that did not mention the flags must keep them: %+v", config)
	}
}

func TestAnEmptyColourClearsTheTag(t *testing.T) {
	existing := protocol.ConnectionConfig{Name: "prod", Color: "red"}
	config, err := connectionFromBody(connectionBody{Color: str("")}, &existing)
	if err != nil {
		t.Fatal(err)
	}
	if config.Color != "" {
		t.Errorf("colour = %q, want cleared", config.Color)
	}
}

func TestASqliteConnectionNeedsOnlyAFile(t *testing.T) {
	config, err := connectionFromBody(connectionBody{Name: str("local"), Dialect: str("sqlite"), Database: str("/data/app.db")}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if config.Dialect != protocol.DialectSQLite || config.Database != "/data/app.db" {
		t.Errorf("config: %+v", config)
	}
	if config.Host != "" || config.Port != 0 || config.SSL {
		t.Errorf("no host, port or TLS belong on a file: %+v", config)
	}
	if _, err := connectionFromBody(connectionBody{Name: str("x"), Dialect: str("sqlite")}, nil); err == nil {
		t.Error("a SQLite connection without a path must be refused")
	}
}

func TestASqliteURLFillsTheConnection(t *testing.T) {
	config, err := connectionFromBody(connectionBody{Name: str("local"), URL: str("sqlite:///data/app.db?mode=ro")}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if config.Dialect != protocol.DialectSQLite || config.Database != "/data/app.db" || !config.ReadOnly {
		t.Errorf("config: %+v", config)
	}
}
