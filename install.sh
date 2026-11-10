#!/bin/sh
# Installs the latest dipper release.
#
#   curl -fsSL https://raw.githubusercontent.com/SumitKumar-17/dipper/main/install.sh | sh
#
# Environment:
#   DIPPER_VERSION        install this tag instead of the latest (e.g. vX.Y.Z)
#   DIPPER_INSTALL_DIR    install here instead of the first writable default
#   DIPPER_DOWNLOAD_BASE  fetch assets from here instead of GitHub (testing, mirrors)
#   DIPPER_NO_MODIFY_PATH leave the shell profile alone and just print the line to add
set -eu

REPO="SumitKumar-17/dipper"
BIN="dipper"
MARKER="# added by the dipper installer"
OS=""

say() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || err "$1 is required but not installed"; }

need uname
need tar

# curl or wget, whichever is here.
if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1"; }
  fetch_to() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -qO- "$1"; }
  fetch_to() { wget -qO "$2" "$1"; }
else
  err "curl or wget is required"
fi

detect_target() {
  os=$(uname -s)
  arch=$(uname -m)
  case "$os" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    MINGW* | MSYS* | CYGWIN*)
      err "Windows is not supported by this script - download dipper-<version>-windows-amd64.exe from https://github.com/$REPO/releases/latest" ;;
    *) err "unsupported operating system: $os" ;;
  esac
  case "$arch" in
    x86_64 | amd64) arch=amd64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) err "unsupported architecture: $arch" ;;
  esac
  printf '%s-%s\n' "$os" "$arch"
}

# Where github.com/<repo>/releases/latest redirects to, ending in /tag/<tag>. The API would answer
# this too, but it is rate limited to 60 requests an hour per IP address for anonymous callers, and
# a shared office or VPN address runs out of those. The redirect has no such limit.
latest_url() {
  url="https://github.com/$REPO/releases/latest"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o /dev/null -w '%{url_effective}' "$url"
  else
    wget --max-redirect=0 -S -O /dev/null "$url" 2>&1 | sed -n 's/^ *[Ll]ocation: *//p' | head -1 | tr -d '\r'
  fi
}

latest_tag() {
  tag=$(latest_url | sed -n 's#.*/releases/tag/\([^/?]*\).*#\1#p')
  [ -n "$tag" ] || err "could not find the latest release of $REPO (it may have none yet, or GitHub could not be reached); set DIPPER_VERSION=vX.Y.Z to choose one"
  printf '%s\n' "$tag"
}

# A writable folder that is already on PATH wins, because then `dipper` works in this very terminal
# with nothing to source: a script cannot change the PATH of the shell that started it. Failing that,
# a writable one that exists, and last ~/.local/bin, which is created and added to the profile.
choose_dir() {
  if [ -n "${DIPPER_INSTALL_DIR:-}" ]; then
    printf '%s\n' "$DIPPER_INSTALL_DIR"
    return
  fi
  for dir in /usr/local/bin "$HOME/.local/bin" "$HOME/bin"; do
    if [ -d "$dir" ] && [ -w "$dir" ] && on_path "$dir"; then
      printf '%s\n' "$dir"
      return
    fi
  done
  for dir in /usr/local/bin "$HOME/.local/bin" "$HOME/bin"; do
    if [ -d "$dir" ] && [ -w "$dir" ]; then
      printf '%s\n' "$dir"
      return
    fi
  done
  printf '%s\n' "$HOME/.local/bin"
}

verify_checksum() {
  archive=$1
  sums=$2
  if command -v sha256sum >/dev/null 2>&1; then
    checker="sha256sum -c"
  elif command -v shasum >/dev/null 2>&1; then
    checker="shasum -a 256 -c"
  else
    say "  ! neither sha256sum nor shasum found - skipping checksum verification"
    return 0
  fi
  # checksums.txt lists every asset; check only the one we downloaded.
  if ! grep " [ *]\{0,1\}$archive\$" "$sums" | $checker - >/dev/null 2>&1; then
    err "checksum mismatch for $archive - refusing to install"
  fi
  say "  checksum ok"
}

# ~/.local/bin rather than /Users/you/.local/bin, for anything we print.
tilde() {
  case "$1" in
    "$HOME"/*) printf '~/%s\n' "${1#"$HOME"/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

on_path() {
  case ":$PATH:" in *":$1:"*) return 0 ;; esac
  return 1
}

# The line that puts a directory on PATH, in the syntax of the shell the user actually runs.
path_line() {
  case "${SHELL##*/}" in
    fish) printf 'fish_add_path "%s"\n' "$1" ;;
    *) printf 'export PATH="%s:$PATH"\n' "$1" ;;
  esac
}

# Where that line goes, or nothing for a shell we don't know. A login shell on macOS reads
# ~/.bash_profile and not ~/.bashrc, which is the other way round from Linux.
profile_path() {
  case "${SHELL##*/}" in
    zsh) printf '%s\n' "$HOME/.zshrc" ;;
    fish) printf '%s\n' "$HOME/.config/fish/config.fish" ;;
    bash) [ "$OS" = darwin ] && printf '%s\n' "$HOME/.bash_profile" || printf '%s\n' "$HOME/.bashrc" ;;
  esac
}

# Nothing here can fix the terminal that is already open - its PATH was read before we ran - so
# the profile gets the line and this shell gets one to paste.
setup_path() {
  dir=$1
  if on_path "$dir"; then
    say ""
    say "Run: $BIN"
    return 0
  fi

  # $HOME, not ~, which does not expand inside the quotes of the exported value.
  ref=$dir
  case "$dir" in "$HOME"/*) ref="\$HOME/${dir#"$HOME"/}" ;; esac
  line=$(path_line "$ref")
  rc=$(profile_path)
  [ -z "${DIPPER_NO_MODIFY_PATH:-}" ] || rc=""

  if [ -n "$rc" ]; then
    if [ -f "$rc" ] && grep -qF "$ref" "$rc"; then
      say "  $(tilde "$rc") already puts it on PATH"
    elif mkdir -p "$(dirname "$rc")" 2>/dev/null &&
      printf '\n%s\n%s\n' "$MARKER" "$line" >> "$rc" 2>/dev/null; then
      say "  added $(tilde "$dir") to PATH in $(tilde "$rc")"
    else
      rc=""
    fi
  fi

  say ""
  if [ -n "$rc" ]; then
    say "For this terminal, run:"
    say ""
    say "  $line"
    say ""
    say "New terminals have it already. Then: $BIN"
  else
    say "$(tilde "$dir") is not on your PATH. Add this line to your shell profile:"
    say ""
    say "  $line"
    say ""
    say "Or run it directly: $(tilde "$dir")/$BIN"
  fi
}

# Adds dipper to the application launcher (macOS Launchpad and Spotlight, the Linux application
# menu) by asking the binary itself, which knows its own icon and path. An older release has no such
# command, which is fine: it is skipped, and the next update brings it. A Linux machine with no
# desktop session, such as a server reached over SSH, has no launcher to add to.
install_app_entry() {
  [ "${DIPPER_NO_APP:-}" = 1 ] && return 0
  if [ "$OS" = linux ] && [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}${XDG_CURRENT_DESKTOP:-}" ]; then
    return 0
  fi
  "$1/$BIN" desktop install 2>/dev/null | sed 's/^/  /' || true
}

main() {
  target=$(detect_target)
  OS=${target%-*}
  tag=${DIPPER_VERSION:-$(latest_tag)}
  version=${tag#v}
  archive="$BIN-$version-$target.tar.gz"
  base=${DIPPER_DOWNLOAD_BASE:-"https://github.com/$REPO/releases/download/$tag"}

  say "dipper $tag ($target)"

  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT INT TERM

  say "  downloading $archive"
  fetch_to "$base/$archive" "$tmp/$archive" || err "no asset $archive in release $tag"

  if fetch_to "$base/checksums.txt" "$tmp/checksums.txt" 2>/dev/null; then
    (cd "$tmp" && verify_checksum "$archive" checksums.txt)
  else
    say "  ! no checksums.txt in this release - skipping verification"
  fi

  tar -xzf "$tmp/$archive" -C "$tmp"
  [ -f "$tmp/$BIN" ] || err "archive did not contain a $BIN binary"
  chmod +x "$tmp/$BIN"

  dir=$(choose_dir)
  mkdir -p "$dir" 2>/dev/null || err "cannot create $dir"
  if [ ! -w "$dir" ]; then
    err "$dir is not writable - re-run with DIPPER_INSTALL_DIR=\$HOME/.local/bin, or use sudo"
  fi
  mv "$tmp/$BIN" "$dir/$BIN"

  say "  installed $(tilde "$dir")/$BIN"
  install_app_entry "$dir"
  setup_path "$dir"
}

main "$@"
