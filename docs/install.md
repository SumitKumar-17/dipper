# Install

Dipper is one binary. Pick your system below; [updating](#updating) and the environment variables
are here too.

## macOS and Linux

```sh
curl -fsSL https://raw.githubusercontent.com/SumitKumar-17/dipper/main/install.sh | sh
```

This fetches the latest release for your platform, verifies its checksum, and installs `dipper`
into `/usr/local/bin` if that is writable, or `~/.local/bin` otherwise.

If it lands somewhere that is not on your `PATH`, the installer adds it to your shell profile
(`~/.zshrc`, `~/.bash_profile` or `~/.bashrc`, or fish's `config.fish`) and prints one line to
paste into the terminal you already have open. New terminals need nothing.

```sh
dipper          # starts the server and opens the UI
dipper status   # is it running, and where
dipper stop     # stop it
dipper update   # install the latest release over this one
```

| Variable                | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `DIPPER_VERSION`         | install a specific tag, e.g. `vX.Y.Z`, instead of latest |
| `DIPPER_INSTALL_DIR`     | install somewhere else, e.g. `~/bin`                     |
| `DIPPER_NO_MODIFY_PATH`  | leave the shell profile alone and just print the line    |
| `DIPPER_NO_UPDATE_CHECK` | don't look for a newer release on start                  |
| `DIPPER_NO_APP`          | don't add Dipper to the application menu / Start Menu    |

## As an application

Launchers list applications, not command line tools, so the installers also add Dipper to yours:

| System  | Where it appears                                                       |
| ------- | ---------------------------------------------------------------------- |
| Linux   | your application menu (a `dipper.desktop` entry and icon under `~/.local/share`), when a desktop session is running |
| macOS   | Launchpad and Spotlight (`~/Applications/Dipper.app`)                  |
| Windows | the Start Menu (a per-user `Dipper` shortcut)                          |

Opening it starts the server and opens your browser, or opens the one already running. It has no
window of its own, so quit it with `dipper stop`; the Linux entry also has a **Stop Dipper** action.
Nothing needs an administrator, and the entry is built on your machine, so macOS's Gatekeeper has
nothing to check.

The binary does this itself, so you can run it any time:

```sh
dipper desktop           # add (or refresh) the entry
dipper desktop remove    # take it out; your connections and queries are untouched
```

`dipper update` refreshes an entry that exists and never adds one you did not ask for. Set
`DIPPER_NO_APP=1` to have the installer skip it.

## Getting `dipper` on your PATH

The installer puts the binary in a folder that is already on your `PATH` when it can (`/usr/local/bin`,
`~/.local/bin` or `~/bin`), so `dipper` works in the same terminal with nothing to do. Otherwise it
uses `~/.local/bin` and adds it to your shell profile (`.zshrc`, `.bashrc`, `.bash_profile` or fish's
`config.fish`). A script cannot change the terminal that started it, so that one needs the line it
prints, or a new terminal. On Windows it adds the folder to your user `PATH`. The application entry
above does not depend on `PATH` at all: it points at the binary directly.

## Updating

```sh
dipper update           # download the latest release and replace this binary
dipper update --check   # just say whether there is a newer one
```

`update` fetches the release for your platform, verifies it against the release's checksum, and
replaces the binary in place - the same file `dipper` already runs from, wherever the installer
put it. Nothing else on disk is touched: connections, settings and history stay where they are.

A server that is already running keeps the old version until you restart it (`dipper stop`, then
`dipper`), and `dipper update` says so when it finds one.

`dipper serve` also looks for a newer release once a day, in the background, and prints a single
line when there is one. It never blocks startup and never updates anything on its own; set
`DIPPER_NO_UPDATE_CHECK=1` to turn the look off entirely.

`dipper update --version v0.1.0` installs that exact tag, which is how you go back a version.

On Windows, `dipper update` replaces the `.exe` you ran it from. Windows will not delete a file
that is open, so the previous version is left beside it as `dipper.exe.old` and cleared on the
next update - deleting it by hand is fine too.

## Windows

In PowerShell:

```powershell
irm https://raw.githubusercontent.com/SumitKumar-17/dipper/main/install.ps1 | iex
```

This downloads the latest release, verifies its checksum, installs `dipper.exe` into
`%LOCALAPPDATA%\Programs\dipper` and adds that folder to your user `PATH` (open a new terminal
afterwards). It reads the same `DIPPER_VERSION`, `DIPPER_INSTALL_DIR` and `DIPPER_NO_MODIFY_PATH`
variables as the shell installer. The script has not yet been run on a Windows machine, so if it
misbehaves, please open an issue.

Or download `dipper-<version>-windows-amd64.exe` from the
[releases page](https://github.com/SumitKumar-17/dipper/releases/latest) and run it. Windows shows a
SmartScreen warning the first time - choose **More info → Run anyway**.

## From source

Needs Go 1.25+ and Bun. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## If macOS refuses to open it

Dipper's binaries are not notarized yet. The `curl` install above avoids this entirely, because
macOS only quarantines files a *browser* downloaded. If you took the binary from the releases
page instead and macOS says the developer cannot be verified:

```sh
xattr -d com.apple.quarantine ./dipper
```
