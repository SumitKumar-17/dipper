package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"dipper/desktop"
)

// cmdDesktop adds Dipper to, or removes it from, the system's application launcher.
func cmdDesktop(args []string) error {
	flags := flag.NewFlagSet("desktop", flag.ExitOnError)
	flags.Usage = func() {
		fmt.Print(`usage: dipper desktop [install|remove]

install   add Dipper to your applications (the Linux application menu, macOS Launchpad and
          Spotlight, the Windows Start Menu), pointing at this binary. The default.
remove    take it out again. Your connections, queries and settings are not touched.

Opening the entry starts the server and opens the browser, like typing "dipper". It has no window
of its own: quit it with "dipper stop" (on Linux, the entry's Stop Dipper action does the same).
`)
	}
	if err := flags.Parse(args); err != nil {
		return err
	}
	action := "install"
	if flags.NArg() > 0 {
		action = flags.Arg(0)
	}

	switch action {
	case "install":
		binary, err := os.Executable()
		if err != nil {
			return err
		}
		if resolved, err := filepath.EvalSymlinks(binary); err == nil {
			binary = resolved
		}
		written, err := desktop.Install(binary, Version)
		if errors.Is(err, desktop.ErrUnsupported) {
			fmt.Println("nothing to add: " + err.Error())
			return nil
		}
		if err != nil {
			return err
		}
		fmt.Printf("added Dipper to your applications (%s)\n", tilde(written[0]))
		return nil
	case "remove":
		removed, err := desktop.Remove()
		if errors.Is(err, desktop.ErrUnsupported) || (err == nil && len(removed) == 0) {
			fmt.Println("Dipper was not in your applications")
			return nil
		}
		if err != nil {
			return err
		}
		fmt.Println("removed Dipper from your applications")
		return nil
	}
	return fmt.Errorf("unknown desktop action %q: use install or remove", action)
}

// refreshDesktop re-runs the new binary's own `desktop install` after an update, but only where an
// entry already exists, so an update never adds one the person did not ask for. It goes through the
// new binary because that is the one whose version and icon the entry should carry.
func refreshDesktop(binary string) {
	if !desktop.Installed() {
		return
	}
	if err := exec.Command(binary, "desktop", "install").Run(); err == nil {
		fmt.Println("  refreshed the application entry")
	}
}
