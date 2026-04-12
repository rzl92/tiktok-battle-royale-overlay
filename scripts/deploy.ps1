param(
  [string]$Message = "Update TikTok Battle Royale",
  [switch]$NoCommit,
  [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $SkipChecks) {
  npm.cmd run check
}

if (-not $NoCommit) {
  git add -A
  $staged = git diff --cached --name-only
  if ($staged) {
    git commit -m $Message
  } else {
    Write-Host "No staged changes to commit."
  }
}

git push origin main
git push hf main

Write-Host "Pushed to GitHub and Hugging Face."
