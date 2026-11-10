package desktop

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func windowsDataDir() string {
	if dir := os.Getenv("LOCALAPPDATA"); dir != "" {
		return filepath.Join(dir, "dipper")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "AppData", "Local", "dipper")
}

// windowsShortcut is the Start Menu entry, in the per-user Programs folder so no administrator is needed.
func windowsShortcut() string {
	return filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", "Dipper.lnk")
}

// installWindows adds a Start Menu shortcut. The shortcut runs a small script rather than dipper.exe,
// because the server is a console program and would otherwise open a terminal window that has to
// stay open. A .lnk can only be made through the shell's COM object, so PowerShell does that part.
func installWindows(binary string) ([]string, error) {
	dir := windowsDataDir()
	launcher := filepath.Join(dir, "launch.vbs")
	icon := filepath.Join(dir, "dipper.ico")
	if err := write(launcher, []byte(windowsLauncher(binary)), 0o644); err != nil {
		return nil, err
	}
	if err := write(icon, ico(asset("icon-256.png")), 0o644); err != nil {
		return nil, err
	}
	shortcut := windowsShortcut()
	if err := os.MkdirAll(filepath.Dir(shortcut), 0o755); err != nil {
		return nil, err
	}
	script := fmt.Sprintf(
		"$s = (New-Object -ComObject WScript.Shell).CreateShortcut(%s); $s.TargetPath = %s; $s.Arguments = %s; $s.IconLocation = %s; $s.Description = 'Dipper, a SQL workspace'; $s.Save()",
		psString(shortcut), psString(filepath.Join(os.Getenv("SystemRoot"), "System32", "wscript.exe")),
		psString(`"`+launcher+`"`), psString(icon))
	if out, err := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script).CombinedOutput(); err != nil {
		return nil, fmt.Errorf("could not create the Start Menu shortcut: %v: %s", err, strings.TrimSpace(string(out)))
	}
	return []string{shortcut, launcher, icon}, nil
}

func removeWindows() ([]string, error) {
	dir := windowsDataDir()
	return removeAll(windowsShortcut(), filepath.Join(dir, "launch.vbs"), filepath.Join(dir, "dipper.ico")), nil
}

// psString is a single-quoted PowerShell string, where a quote is doubled.
func psString(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
