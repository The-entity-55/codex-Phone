#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

$InstallDir = Join-Path $env:USERPROFILE ".claude-phone-cli"
$RepoUrl = "https://github.com/theNetworkChuck/claude-phone.git"
$CliDir = Join-Path $InstallDir "cli"

Write-Host ""
Write-Host "Claude Phone Windows Installer" -ForegroundColor Cyan
Write-Host ""

function Require-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Host "Missing required command: $Name" -ForegroundColor Red
    Write-Host "Install it first: $InstallHint" -ForegroundColor Yellow
    exit 1
  }
}

Require-Command "git" "https://git-scm.com/download/win"
Require-Command "node" "https://nodejs.org/"
Require-Command "npm" "https://nodejs.org/"

if (-not (Get-Command "codex" -ErrorAction SilentlyContinue)) {
  Write-Host "Codex CLI was not found in PATH." -ForegroundColor Yellow
  Write-Host "Install Codex CLI and run: codex login" -ForegroundColor Yellow
  Write-Host ""
}

if (Test-Path $InstallDir) {
  Write-Host "Updating existing installation..."
  git -C $InstallDir pull
} else {
  Write-Host "Cloning Claude Phone..."
  git clone $RepoUrl $InstallDir
}

Write-Host "Installing CLI dependencies..."
Push-Location $CliDir
npm install --omit=dev
npm link
Pop-Location

Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  codex login"
Write-Host "  claude-phone setup"
Write-Host "  claude-phone start"
Write-Host ""
