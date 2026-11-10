package desktop

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"strings"
)

// Everything in this file turns inputs into the bytes of a file and touches no disk, so each
// operating system's format is testable on any machine.

// execArg quotes one argument the way the Desktop Entry spec asks: in double quotes, with the four
// characters that stay special inside them escaped.
func execArg(arg string) string {
	r := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "`", "\\`", "$", `\$`)
	return `"` + r.Replace(arg) + `"`
}

// desktopEntry is the .desktop file a Linux launcher or application menu reads. Starting it twice is
// harmless (`dipper serve` opens the running server instead), and the Stop action is how a person
// who never opened a terminal quits the server.
func desktopEntry(binary string) string {
	return strings.Join([]string{
		"[Desktop Entry]",
		"Type=Application",
		"Name=Dipper",
		"GenericName=SQL workspace",
		"Comment=A SQL workspace for PostgreSQL, MySQL and SQLite",
		"Exec=" + execArg(binary) + " serve",
		"Icon=dipper",
		"Terminal=false",
		"Categories=Development;Database;",
		"Keywords=sql;postgres;mysql;sqlite;database;",
		"StartupNotify=false",
		"Actions=stop;",
		"",
		"[Desktop Action stop]",
		"Name=Stop Dipper",
		"Exec=" + execArg(binary) + " stop",
		"",
	}, "\n")
}

func xmlEscape(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;").Replace(s)
}

// infoPlist describes the macOS app bundle. LSUIElement keeps it out of the Dock: the app only
// starts a server and has no window of its own.
func infoPlist(version string) string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Dipper</string>
  <key>CFBundleDisplayName</key><string>Dipper</string>
  <key>CFBundleIdentifier</key><string>io.github.sumitkumar-17.dipper</string>
  <key>CFBundleExecutable</key><string>Dipper</string>
  <key>CFBundleIconFile</key><string>Dipper</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>` + xmlEscape(version) + `</string>
  <key>CFBundleVersion</key><string>` + xmlEscape(version) + `</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
`
}

// shellQuote single-quotes a path for /bin/sh.
func shellQuote(s string) string { return `'` + strings.ReplaceAll(s, `'`, `'\''`) + `'` }

// macLauncher is the app's executable. It runs the server detached, because an app that stayed in
// the foreground would be reported as not responding, and `dipper serve` already opens the browser.
func macLauncher(binary string) string {
	return "#!/bin/sh\n" +
		"mkdir -p \"$HOME/.dipper\"\n" +
		"nohup " + shellQuote(binary) + " serve > \"$HOME/.dipper/serve.log\" 2>&1 &\n"
}

// icns wraps one 512 pixel PNG in the container macOS reads app icons from. Modern macOS accepts a
// PNG payload for the "ic09" (512x512) type, so no resampling is needed.
func icns(png []byte) []byte {
	var out bytes.Buffer
	out.WriteString("icns")
	_ = binary.Write(&out, binary.BigEndian, uint32(8+8+len(png)))
	out.WriteString("ic09")
	_ = binary.Write(&out, binary.BigEndian, uint32(8+len(png)))
	out.Write(png)
	return out.Bytes()
}

// ico wraps one 256 pixel PNG in the container Windows shortcuts take icons from. Since Vista an
// ICO entry may hold a PNG as is; a width and height byte of 0 means 256.
func ico(png []byte) []byte {
	var out bytes.Buffer
	_ = binary.Write(&out, binary.LittleEndian, []uint16{0, 1, 1}) // reserved, type icon, one image
	out.Write([]byte{0, 0, 0, 0})                                  // 256x256, no palette, reserved
	_ = binary.Write(&out, binary.LittleEndian, []uint16{1, 32})   // planes, bits per pixel
	_ = binary.Write(&out, binary.LittleEndian, uint32(len(png)))
	_ = binary.Write(&out, binary.LittleEndian, uint32(6+16)) // where the image starts
	out.Write(png)
	return out.Bytes()
}

// windowsLauncher is a Windows Script Host file that starts the server with no console window. A
// shortcut straight to dipper.exe would open one, since the server is a console program.
func windowsLauncher(binary string) string {
	return fmt.Sprintf("CreateObject(\"WScript.Shell\").Run \"\"\"\" & %s & \"\"\" serve\", 0, False\r\n", vbsString(binary))
}

// vbsString writes a string literal in VBScript, where a quote is doubled.
func vbsString(s string) string { return `"` + strings.ReplaceAll(s, `"`, `""`) + `"` }
