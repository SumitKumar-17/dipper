package desktop

import (
	"os"
	"path/filepath"
	"time"
)

// installMac writes Dipper.app into appsDir (~/Applications, which needs no administrator). The
// bundle is made on this machine, so Gatekeeper, which checks files that were downloaded, has
// nothing to object to.
func installMac(appsDir, binary, version string) ([]string, error) {
	app := filepath.Join(appsDir, "Dipper.app")
	files := []struct {
		path string
		data []byte
		mode os.FileMode
	}{
		{filepath.Join(app, "Contents", "Info.plist"), []byte(infoPlist(version)), 0o644},
		{filepath.Join(app, "Contents", "MacOS", "Dipper"), []byte(macLauncher(binary)), 0o755},
		{filepath.Join(app, "Contents", "Resources", "Dipper.icns"), icns(asset("icon.png")), 0o644},
	}
	var written []string
	for _, f := range files {
		if err := write(f.path, f.data, f.mode); err != nil {
			return written, err
		}
		// WriteFile keeps the mode of a file that already existed, and the launcher must stay executable.
		if err := os.Chmod(f.path, f.mode); err != nil {
			return written, err
		}
		written = append(written, f.path)
	}
	// Launchpad and Spotlight notice a bundle whose modification time moves.
	now := time.Now()
	_ = os.Chtimes(app, now, now)
	return written, nil
}

func removeMac(appsDir string) ([]string, error) {
	return removeAll(filepath.Join(appsDir, "Dipper.app")), nil
}
