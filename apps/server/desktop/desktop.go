// Package desktop makes Dipper an application of the operating system, not only a command: an entry
// in the Linux application menu, an app in macOS Launchpad and Spotlight, a Start Menu shortcut on
// Windows. Each one starts the server and opens the browser, the same as typing `dipper`.
//
// The files are written by the binary itself, so the installers, `dipper update` and a person
// running `dipper desktop install` all get the same result, and the icon travels inside the binary.
package desktop

import (
	"embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

//go:embed assets/icon.png assets/icon-256.png assets/icon.svg
var assets embed.FS

func asset(name string) []byte {
	data, err := assets.ReadFile("assets/" + name)
	if err != nil {
		// Embedded at build time: a missing file is a broken build, not a runtime condition.
		panic(err)
	}
	return data
}

// ErrUnsupported is returned on an operating system that has no application launcher to add to.
var ErrUnsupported = errors.New("this operating system has no application launcher dipper can add to")

// Install adds Dipper to the system's application launcher, pointing at `binary`, and returns the
// places it wrote. Running it again replaces them, which is how an update refreshes the version.
func Install(binary, version string) ([]string, error) {
	abs, err := filepath.Abs(binary)
	if err != nil {
		return nil, err
	}
	switch runtime.GOOS {
	case "linux":
		return installLinux(linuxDataDir(), abs)
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		return installMac(filepath.Join(home, "Applications"), abs, version)
	case "windows":
		return installWindows(abs)
	}
	return nil, ErrUnsupported
}

// Remove takes Dipper out of the application launcher. Nothing is an error: it is already gone.
func Remove() ([]string, error) {
	switch runtime.GOOS {
	case "linux":
		return removeLinux(linuxDataDir())
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		return removeMac(filepath.Join(home, "Applications"))
	case "windows":
		return removeWindows()
	}
	return nil, ErrUnsupported
}

// Installed reports whether Install has been run on this machine, so an update knows whether there
// is an entry to refresh. It never adds one the person did not ask for.
func Installed() bool {
	switch runtime.GOOS {
	case "linux":
		return exists(filepath.Join(linuxDataDir(), "applications", "dipper.desktop"))
	case "darwin":
		home, err := os.UserHomeDir()
		return err == nil && exists(filepath.Join(home, "Applications", "Dipper.app"))
	case "windows":
		return exists(windowsShortcut())
	}
	return false
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// write creates a file and the folders above it.
func write(path string, data []byte, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("cannot create %s: %w", filepath.Dir(path), err)
	}
	return os.WriteFile(path, data, mode)
}

// removeAll deletes the paths that exist and reports the ones it removed.
func removeAll(paths ...string) []string {
	var removed []string
	for _, path := range paths {
		if _, err := os.Lstat(path); err != nil {
			continue
		}
		if os.RemoveAll(path) == nil {
			removed = append(removed, path)
		}
	}
	return removed
}
