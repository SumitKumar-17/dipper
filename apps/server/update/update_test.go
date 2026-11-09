package update

import "testing"

func TestTagFromURL(t *testing.T) {
	for path, want := range map[string]string{
		"/SumitKumar-17/dipper/releases/tag/v0.3.0":  "v0.3.0",
		"/SumitKumar-17/dipper/releases/tag/v0.4.0/": "v0.4.0",
	} {
		if got, err := tagFromURL(path); err != nil || got != want {
			t.Errorf("tagFromURL(%q) = %q, %v; want %q", path, got, err, want)
		}
	}
	for _, path := range []string{"/SumitKumar-17/dipper/releases", "/SumitKumar-17/dipper/releases/latest", "/SumitKumar-17/dipper/releases/tag/"} {
		if _, err := tagFromURL(path); err == nil {
			t.Errorf("tagFromURL(%q) should fail: no tag", path)
		}
	}
}
