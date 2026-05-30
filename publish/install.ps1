# Install or uninstall qkrpc CLI from GitHub Releases.
#
# One-line install (PowerShell 7+):
#   irm https://raw.githubusercontent.com/QuickerHub/quicker-rpc/main/publish/install.ps1 | iex
#
# Options:
#   -Version latest | 0.3.9 | v0.3.9
#   -InstallDir "$env:LOCALAPPDATA\Programs\qkrpc"
#   -Uninstall

#Requires -Version 7.0

[CmdletBinding()]
param(
    [string]$Version = 'latest',
    [string]$InstallDir = '',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$localLib = Join-Path $PSScriptRoot 'qkrpc-publish-lib.ps1'
if ($PSScriptRoot -and (Test-Path -LiteralPath $localLib)) {
    . $localLib
}
else {
    $tempLib = Join-Path $env:TEMP 'qkrpc-publish-lib.ps1'
    $libUrl = 'https://raw.githubusercontent.com/QuickerHub/quicker-rpc/main/publish/qkrpc-publish-lib.ps1'
    Invoke-WebRequest -Uri $libUrl -OutFile $tempLib -UseBasicParsing
    . $tempLib
}

$GitHubRepo = 'QuickerHub/quicker-rpc'
$AssetNamePattern = 'qkrpc-*-win-x64.zip'
$DefaultInstallDir = Join-Path $env:LOCALAPPDATA 'Programs\qkrpc'

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = $DefaultInstallDir
}

function Get-GitHubRelease {
    param([string]$RequestedVersion)

    $headers = @{ 'User-Agent' = 'qkrpc-install' }

    if ($RequestedVersion -eq 'latest') {
        $uri = "https://api.github.com/repos/$GitHubRepo/releases/latest"
        return Invoke-RestMethod -Uri $uri -Headers $headers
    }

    $tag = if ($RequestedVersion -match '^v') { $RequestedVersion } else { "v$(Get-QuickerRpcSemVerFromVersion -Version $RequestedVersion)" }
    $uri = "https://api.github.com/repos/$GitHubRepo/releases/tags/$tag"
    return Invoke-RestMethod -Uri $uri -Headers $headers
}

function Install-QkrpcCli {
    Write-Host "Installing qkrpc to $InstallDir ..." -ForegroundColor Cyan

    $release = Get-GitHubRelease -RequestedVersion $Version
    $asset = @($release.assets | Where-Object { $_.name -like $AssetNamePattern }) | Select-Object -First 1
    if (-not $asset) {
        throw "Release '$($release.tag_name)' has no asset matching '$AssetNamePattern'. Publish the CLI zip first."
    }

    Write-Host "Release: $($release.tag_name) ($($asset.name), $([math]::Round($asset.size / 1MB, 2)) MB)" -ForegroundColor Cyan

    $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("qkrpc-install-" + [Guid]::NewGuid().ToString('N'))
    $zipPath = Join-Path $tempRoot $asset.name
    $extractDir = Join-Path $tempRoot 'extract'

    try {
        New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

        if (Test-Path -LiteralPath $InstallDir) {
            Write-Host "Removing previous install..." -ForegroundColor Yellow
            Remove-Item -LiteralPath $InstallDir -Recurse -Force
        }

        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        Copy-Item -Path (Join-Path $extractDir '*') -Destination $InstallDir -Recurse -Force

        $exePath = Join-Path $InstallDir 'qkrpc.exe'
        if (-not (Test-Path -LiteralPath $exePath)) {
            throw "Downloaded archive does not contain qkrpc.exe."
        }

        Add-QuickerRpcUserPath -DirectoryPath $InstallDir | Out-Null

        Write-Host ''
        Write-Host 'qkrpc installed successfully.' -ForegroundColor Green
        Write-Host "  Location: $InstallDir\qkrpc.exe" -ForegroundColor Cyan
        Write-Host ''
        Write-Host 'Next steps:' -ForegroundColor Yellow
        Write-Host '  1. Open a new terminal'
        Write-Host '  2. Load the Quicker plugin (see README)'
        Write-Host '  3. Run: qkrpc ping --json'
    }
    finally {
        if (Test-Path -LiteralPath $tempRoot) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Uninstall-QkrpcCli {
    Write-Host "Uninstalling qkrpc from $InstallDir ..." -ForegroundColor Yellow

    if (Test-Path -LiteralPath $InstallDir) {
        Remove-Item -LiteralPath $InstallDir -Recurse -Force
        Write-Host "Removed: $InstallDir" -ForegroundColor Green
    }
    else {
        Write-Host "Install directory not found (already removed?): $InstallDir" -ForegroundColor Yellow
    }

    Remove-QuickerRpcUserPath -DirectoryPath $InstallDir | Out-Null
    Write-Host 'qkrpc uninstalled.' -ForegroundColor Green
}

if ($Uninstall) {
    Uninstall-QkrpcCli
}
else {
    Install-QkrpcCli
}
