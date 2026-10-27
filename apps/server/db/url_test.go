package db

import "testing"

func TestParseURLKeepsOnlyKnownOptions(t *testing.T) {
	config, err := ParseConnectionURL("postgres://u:p@localhost/app?sslmode=require&sslpassword=hunter2&password=x&application_name=dipper")
	if err != nil {
		t.Fatal(err)
	}
	if len(config.Options) != 2 || config.Options["sslmode"] != "require" || config.Options["application_name"] != "dipper" {
		t.Errorf("unexpected options: %v", config.Options)
	}
}
