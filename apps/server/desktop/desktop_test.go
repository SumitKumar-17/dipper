package desktop

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDesktopEntryQuotesTheBinary(t *testing.T) {
	entry := desktopEntry(`/home/me/my "bin"/dipper`)
	for _, want := range []string{
		"Exec=\"/home/me/my \\\"bin\\\"/dipper\" serve\n",
		"Exec=\"/home/me/my \\\"bin\\\"/dipper\" stop\n",
		"Icon=dipper\n", "Terminal=false\n", "Actions=stop;\n",
	} {
		if !strings.Contains(entry, want) {
			t.Errorf("entry lacks %q:\n%s", want, entry)
		}
	}
}

func TestIcnsAndIcoWrapThePNGUnchanged(t *testing.T) {
	png := asset("icon.png")
	mac := icns(png)
	if string(mac[:4]) != "icns" || binary.BigEndian.Uint32(mac[4:8]) != uint32(len(mac)) || string(mac[8:12]) != "ic09" || !bytes.HasSuffix(mac, png) {
		t.Error("icns container is malformed")
	}
	win := ico(asset("icon-256.png"))
	if binary.LittleEndian.Uint16(win[2:4]) != 1 || binary.LittleEndian.Uint16(win[4:6]) != 1 {
		t.Error("ico header must declare one icon image")
	}
	size, offset := binary.LittleEndian.Uint32(win[14:18]), binary.LittleEndian.Uint32(win[18:22])
	if int(offset)+int(size) != len(win) || !bytes.HasPrefix(win[offset:], []byte("\x89PNG")) {
		t.Error("ico entry must point at the embedded PNG")
	}
}

func TestLaunchersQuoteAwkwardPaths(t *testing.T) {
	if got := macLauncher("/Users/o'neil/bin/dipper"); !strings.Contains(got, `nohup '/Users/o'\''neil/bin/dipper' serve`) {
		t.Errorf("mac launcher mis-quotes: %s", got)
	}
	if got := windowsLauncher(`C:\Users\me\dipper.exe`); !strings.Contains(got, `"C:\Users\me\dipper.exe"`) || !strings.HasSuffix(got, "0, False\r\n") {
		t.Errorf("windows launcher: %s", got)
	}
	if got := psString("it's"); got != "'it''s'" {
		t.Errorf("psString = %s", got)
	}
}

func TestInfoPlistIsEscaped(t *testing.T) {
	if got := infoPlist("1.0<x>"); !strings.Contains(got, "1.0&lt;x&gt;") {
		t.Error("version must be XML escaped")
	}
}

func TestInstallLinuxWritesAndRemoves(t *testing.T) {
	dir := t.TempDir()
	written, err := installLinux(dir, "/opt/dipper")
	if err != nil || len(written) != 3 {
		t.Fatalf("install: %v %v", written, err)
	}
	entry, _ := os.ReadFile(filepath.Join(dir, "applications", "dipper.desktop"))
	if !strings.Contains(string(entry), `Exec="/opt/dipper" serve`) {
		t.Errorf("entry: %s", entry)
	}
	// Installing again replaces rather than fails.
	if _, err := installLinux(dir, "/opt/other"); err != nil {
		t.Fatal(err)
	}
	removed, _ := removeLinux(dir)
	if len(removed) != 3 {
		t.Errorf("removed %v", removed)
	}
	if again, _ := removeLinux(dir); len(again) != 0 {
		t.Errorf("a second remove has nothing to do: %v", again)
	}
}

func TestInstallMacBuildsAnExecutableBundle(t *testing.T) {
	apps := t.TempDir()
	if _, err := installMac(apps, "/usr/local/bin/dipper", "0.5.0"); err != nil {
		t.Fatal(err)
	}
	launcher := filepath.Join(apps, "Dipper.app", "Contents", "MacOS", "Dipper")
	info, err := os.Stat(launcher)
	if err != nil || info.Mode()&0o111 == 0 {
		t.Fatalf("launcher must be executable: %v %v", info, err)
	}
	// A second install over the first must keep it executable.
	if _, err := installMac(apps, "/usr/local/bin/dipper", "0.5.1"); err != nil {
		t.Fatal(err)
	}
	if info, _ := os.Stat(launcher); info.Mode()&0o111 == 0 {
		t.Error("launcher lost its executable bit on reinstall")
	}
	plist, _ := os.ReadFile(filepath.Join(apps, "Dipper.app", "Contents", "Info.plist"))
	if !strings.Contains(string(plist), "0.5.1") {
		t.Error("reinstall must refresh the version")
	}
	if removed, _ := removeMac(apps); len(removed) != 1 {
		t.Errorf("removed %v", removed)
	}
}
