@echo off
REM Builds the dipper binary with the web UI embedded, for Windows without a bash shell.
REM Cross-compiling from macOS or Linux covers Windows too, so this is a convenience, not a
REM requirement: scripts/build.sh --all already produces dipper-windows-amd64.exe.
setlocal
set HERE=%~dp0
set GO_DIR=%HERE%..
set REPO=%GO_DIR%\..\..

if exist "%REPO%\apps\server\ui\index.html" (
  del /q "%GO_DIR%\ui\static\*" 2>nul
  xcopy /e /i /y /q "%REPO%\apps\server\ui\*" "%GO_DIR%\ui\static\" >nul
  echo ui: copied from apps\server\ui
) else (
  echo ui: none found at apps\server\ui - building an API-only binary
)

REM Same single source as scripts/build.sh. PowerShell parses the JSON properly, which beats
REM teaching batch to split on quotes.
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content -Raw '%REPO%\apps\server\package.json' ^| ConvertFrom-Json).version"`) do set DIPPER_VERSION=%%v
if "%DIPPER_VERSION%"=="" (
  echo apps\server\package.json declares no version
  exit /b 1
)

pushd "%GO_DIR%"
set CGO_ENABLED=0
go build -trimpath -ldflags="-s -w -X main.Version=%DIPPER_VERSION%" -o dist\dipper.exe .
popd
echo built dist\dipper.exe
endlocal
