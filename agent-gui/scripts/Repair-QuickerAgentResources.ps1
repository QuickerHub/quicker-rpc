#!/usr/bin/env pwsh
# Repair broken bundled qkrpc in QuickerAgent install (0-byte Kestrel DLLs → startup timeout).
#
# Usage:
#   pwsh ./scripts/Repair-QuickerAgentResources.ps1
#   pwsh ./scripts/Repair-QuickerAgentResources.ps1 -SourceDir D:\source\repos\quicker\quicker-rpc\publish\cli

[CmdletBinding()]
param(
    [string] $TargetDir = (Join-Path $env:LOCALAPPDATA 'QuickerAgent\resources\qkrpc'),
    [string] $SourceDir = (Join-Path $env:LOCALAPPDATA 'Programs\qkrpc')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $RepoRoot 'publish\qkrpc-publish-lib.ps1')

$KestrelDll = 'Microsoft.AspNetCore.Server.Kestrel.Core.dll'

function Test-QkrpcBundleHealthy([string] $Dir) {
    if (-not (Test-Path (Join-Path $Dir 'qkrpc.exe'))) { return $false }
    $dll = Join-Path $Dir $KestrelDll
    if (-not (Test-Path -LiteralPath $dll)) { return $false }
    return (Get-Item -LiteralPath $dll).Length -gt 100000
}

if (-not (Test-Path -LiteralPath $TargetDir)) {
    throw "QuickerAgent bundled qkrpc not found: $TargetDir"
}

if (Test-QkrpcBundleHealthy -Dir $TargetDir) {
    Write-Host "OK: bundled qkrpc already healthy at $TargetDir" -ForegroundColor Green
    exit 0
}

if (-not (Test-QkrpcBundleHealthy -Dir $SourceDir)) {
    throw "Healthy qkrpc source not found. Install qkrpc CLI or run: pwsh ./publish/publish-rpc.ps1 -SkipInstall"
}

Write-Host "Repairing bundled qkrpc:" -ForegroundColor Cyan
Write-Host "  from $SourceDir"
Write-Host "  to   $TargetDir"

Get-Process -Name 'quicker-agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Stop-QkrpcProcesses | Out-Null
Start-Sleep -Seconds 1

robocopy $SourceDir $TargetDir /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed with exit code $LASTEXITCODE"
}

if (-not (Test-QkrpcBundleHealthy -Dir $TargetDir)) {
    throw "Repair finished but $KestrelDll is still invalid under $TargetDir"
}

Write-Host "Repair OK. You can start QuickerAgent now." -ForegroundColor Green
