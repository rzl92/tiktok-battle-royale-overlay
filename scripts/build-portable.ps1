param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $SkipInstall -and -not (Test-Path (Join-Path $root "node_modules"))) {
  npm.cmd install
}

npm.cmd run check
npm.cmd run desktop:portable

$exe = Get-ChildItem -Path (Join-Path $root "dist") -Filter "*portable.exe" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($exe) {
  Write-Host "Portable EXE ready: $($exe.FullName)"
} else {
  Write-Host "Build finished. Check the dist folder for the generated EXE."
}
