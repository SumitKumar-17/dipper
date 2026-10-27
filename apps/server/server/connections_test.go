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
