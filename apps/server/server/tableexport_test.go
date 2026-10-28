package server

import "testing"

func TestExportLimit(t *testing.T) {
	cases := []struct {
		raw  string
		want int
		bad  bool
	}{
		{"", exportDefaultRows, false},
		{"50", 50, false},
		{"999999999", exportMaxRows, false},
		{"0", 0, true},
		{"-3", 0, true},
		{"abc", 0, true},
	}
	for _, c := range cases {
		got, err := exportLimit(c.raw)
		if (err != nil) != c.bad || (!c.bad && got != c.want) {
			t.Errorf("exportLimit(%q) = %d, %v; want %d, bad=%v", c.raw, got, err, c.want, c.bad)
		}
	}
}
