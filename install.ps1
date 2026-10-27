# Installs the latest dipper release on Windows.
#
#   irm https://raw.githubusercontent.com/SumitKumar-17/dipper/main/install.ps1 | iex
#
# Environment (the same names install.sh reads):
#   DIPPER_VERSION        install this tag instead of the latest (e.g. vX.Y.Z)
#   DIPPER_INSTALL_DIR    install here instead of %LOCALAPPDATA%\Programs\dipper
#   DIPPER_DOWNLOAD_BASE  fetch assets from here instead of GitHub (testing, mirrors)
#   DIPPER_NO_MODIFY_PATH leave the user PATH alone and just say what to add
$ErrorActionPreference = 'Stop'

$Repo = 'SumitKumar-17/dipper'
$Bin = 'dipper'

function Say($message) { Write-Host $message }
function Fail($message) { throw "error: $message" }

# Release assets are built for 64-bit x86 Windows.
if (-not [Environment]::Is64BitOperatingSystem) { Fail 'only 64-bit Windows is supported' }
$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -ne 'AMD64') {
  Fail "unsupported architecture: $arch. Download a build from https://github.com/$Repo/releases/latest"
}

function Get-LatestTag {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ 'User-Agent' = 'dipper-installer' }
  if (-not $release.tag_name) {
    Fail "could not find a published release for $Repo. A draft release is not visible here; publish it, or set DIPPER_VERSION"
  }
  return $release.tag_name
}

$tag = if ($env:DIPPER_VERSION) { $env:DIPPER_VERSION } else { Get-LatestTag }
$version = $tag.TrimStart('v')
$asset = "$Bin-$version-windows-amd64.exe"
$base = if ($env:DIPPER_DOWNLOAD_BASE) { $env:DIPPER_DOWNLOAD_BASE } else { "https://github.com/$Repo/releases/download/$tag" }
$dir = if ($env:DIPPER_INSTALL_DIR) { $env:DIPPER_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\dipper' }

Say "dipper $tag (windows-amd64)"

$temp = Join-Path ([IO.Path]::GetTempPath()) ("dipper-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  Say "  downloading $asset"
  $file = Join-Path $temp $asset
  try { Invoke-WebRequest -Uri "$base/$asset" -OutFile $file -UseBasicParsing }
  catch { Fail "no asset $asset in release $tag" }

  # checksums.txt lists every asset; check only the one we downloaded.
  $sums = Join-Path $temp 'checksums.txt'
  try { Invoke-WebRequest -Uri "$base/checksums.txt" -OutFile $sums -UseBasicParsing } catch { $sums = $null }
  if ($sums) {
    $line = Get-Content $sums | Where-Object { $_ -match [regex]::Escape($asset) + '$' } | Select-Object -First 1
    if (-not $line) { Fail "checksums.txt has no entry for $asset - refusing to install" }
    $expected = ($line -split '\s+')[0].ToLower()
    $actual = (Get-FileHash -Algorithm SHA256 $file).Hash.ToLower()
    if ($expected -ne $actual) { Fail "checksum mismatch for $asset - refusing to install" }
    Say '  checksum ok'
  } else {
    Say '  ! no checksums.txt in this release - skipping verification'
  }

  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $target = Join-Path $dir "$Bin.exe"
  # Windows will not overwrite a running exe, but it will rename one: keep the old copy aside, the
  # way `dipper update` does, so installing over a running server still works.
  if (Test-Path $target) { Move-Item -Force $target "$target.old" }
  Move-Item -Force $file $target
  Say "  installed $target"
} finally {
  Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}

# Put the directory on the user's PATH (not the machine's, which would need an administrator).
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$onPath = ($userPath -split ';') -contains $dir
if ($onPath) {
  Say ''
  Say "Run: $Bin"
} elseif ($env:DIPPER_NO_MODIFY_PATH) {
  Say ''
  Say "$dir is not on your PATH. Add it, or run it directly: $dir\$Bin.exe"
} else {
  [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $dir).TrimStart(';'), 'User')
  Say "  added $dir to your PATH"
  Say ''
  Say 'Open a new terminal, then: dipper'
}
