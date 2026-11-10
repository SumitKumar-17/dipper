package desktop

import (
	"os"
	"os/exec"
	"path/filepath"
)

// linuxDataDir is where per-user launcher entries and icons live, by the XDG base directory spec.
func linuxDataDir() string {
	if dir := os.Getenv("XDG_DATA_HOME"); dir != "" && filepath.IsAbs(dir) {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "dipper-data")
	}
	return filepath.Join(home, ".local", "share")
}

func linuxPaths(dataDir string) (entry, png, svg string) {
	return filepath.Join(dataDir, "applications", "dipper.desktop"),
		filepath.Join(dataDir, "icons", "hicolor", "512x512", "apps", "dipper.png"),
		filepath.Join(dataDir, "icons", "hicolor", "scalable", "apps", "dipper.svg")
}

// installLinux writes the launcher entry and its icon under dataDir. Both icon sizes go in so a
// menu can pick the sharper one; the desktop picks the entry up on its own, and the cache refresh
// below only makes that immediate on desktops that cache.
func installLinux(dataDir, binary string) ([]string, error) {
	entry, png, svg := linuxPaths(dataDir)
	if err := write(png, asset("icon.png"), 0o644); err != nil {
		return nil, err
	}
	if err := write(svg, asset("icon.svg"), 0o644); err != nil {
		return nil, err
	}
	if err := write(entry, []byte(desktopEntry(binary)), 0o644); err != nil {
		return nil, err
	}
	refreshLinuxCaches(dataDir)
	return []string{entry, png, svg}, nil
}

func removeLinux(dataDir string) ([]string, error) {
	entry, png, svg := linuxPaths(dataDir)
	removed := removeAll(entry, png, svg)
	if len(removed) > 0 {
		refreshLinuxCaches(dataDir)
	}
	return removed, nil
}

// refreshLinuxCaches asks the desktop's own tools to notice the change. They are optional and
// absent on many systems, so a failure here is not one.
func refreshLinuxCaches(dataDir string) {
	if tool, err := exec.LookPath("update-desktop-database"); err == nil {
		_ = exec.Command(tool, filepath.Join(dataDir, "applications")).Run()
	}
	if tool, err := exec.LookPath("gtk-update-icon-cache"); err == nil {
		_ = exec.Command(tool, "-q", "-t", "-f", filepath.Join(dataDir, "icons", "hicolor")).Run()
	}
}
