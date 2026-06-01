# Install or uninstall qkrpc CLI from GitHub Releases (legacy; prefer setup.exe).
#
# Recommended: download and run qkrpc-win-x64-setup.exe from GitHub Releases.
# This script remains for zip-based / scripted installs.
#
# Options:
#   -ReleaseVersion latest | 0.3.10 | v0.3.10
#   -InstallDir "$env:LOCALAPPDATA\Programs\qkrpc"
#   -Uninstall

#Requires -Version 5.1

[CmdletBinding()]
param(
    [string]$ReleaseVersion = 'latest',
    [string]$InstallDir = '',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$QkrpcInstallScriptVersion = '4'
$QkrpcGitHubRepo = 'QuickerHub/quicker-rpc'
$QkrpcLatestZipName = 'qkrpc-win-x64.zip'

function Get-QkrpcDefaultInstallDir {
    $root = $env:LOCALAPPDATA
    if ([string]::IsNullOrWhiteSpace($root)) {
        throw 'LOCALAPPDATA is not set. Cannot determine install directory.'
    }
    return Join-Path $root 'Programs\qkrpc'
}

function Get-QuickerRpcSemVerFromVersion {
    param([string]$VersionText)

    if ([string]::IsNullOrWhiteSpace($VersionText)) {
        throw 'Version is required.'
    }

    $parts = $VersionText.Trim().TrimStart('v') -split '\.'
    if ($parts.Count -lt 3) {
        throw "Version must have at least three segments (major.minor.patch): $VersionText"
    }

    return ($parts[0..2] -join '.')
}

function Add-QuickerRpcUserPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DirectoryPath
    )

    $resolved = (Resolve-Path -LiteralPath $DirectoryPath -ErrorAction Stop).Path
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')

    if ($currentPath -split ';' | Where-Object { $_ -eq $resolved }) {
        Write-Host "Already on user PATH: $resolved" -ForegroundColor Green
        return $false
    }

    $newPath = if ($currentPath) { "$currentPath;$resolved" } else { $resolved }
    [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
    Write-Host "Added to user PATH: $resolved" -ForegroundColor Green
    Write-Host 'Open a new terminal (or restart the shell) before running qkrpc.' -ForegroundColor Yellow
    return $true
}

function Remove-QuickerRpcUserPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DirectoryPath
    )

    $target = $DirectoryPath.TrimEnd('\')
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    if ([string]::IsNullOrWhiteSpace($currentPath)) {
        return $false
    }

    $segments = @($currentPath -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ne $target })
    $newPath = ($segments -join ';').Trim(';')
    [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
    Write-Host "Removed from user PATH: $target" -ForegroundColor Green
    return $true
}

function Remove-StaleQkrpcUserPaths {
    param(
        [string]$InstallDir = (Get-QkrpcDefaultInstallDir)
    )

    $installTarget = $InstallDir.TrimEnd('\')
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    if ([string]::IsNullOrWhiteSpace($currentPath)) {
        return $false
    }

    $changed = $false
    $segments = @($currentPath -split ';' | ForEach-Object {
        if (-not $_) { return $_ }

        $normalized = $_.TrimEnd('\')
        if ($normalized -eq $installTarget) {
            return $_
        }

        if ($normalized -match '[\\/]publish[\\/]cli$') {
            Write-Host "Removing stale PATH entry: $normalized" -ForegroundColor Yellow
            $changed = $true
            return $null
        }

        return $_
    } | Where-Object { $_ })

    if (-not $changed) {
        return $false
    }

    $newPath = ($segments -join ';').Trim(';')
    [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
    return $true
}

function Install-QkrpcFromDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceDirectory,

        [string]$TargetInstallDir = ''
    )

    if ([string]::IsNullOrWhiteSpace($TargetInstallDir)) {
        $TargetInstallDir = Get-QkrpcDefaultInstallDir
    }

    $sourcePath = (Resolve-Path -LiteralPath $SourceDirectory -ErrorAction Stop).Path
    $exePath = Join-Path $sourcePath 'qkrpc.exe'
    if (-not (Test-Path -LiteralPath $exePath)) {
        throw "Source directory does not contain qkrpc.exe: $sourcePath"
    }

    Write-Host "Installing qkrpc to $TargetInstallDir ..." -ForegroundColor Cyan

    if (Test-Path -LiteralPath $TargetInstallDir) {
        Write-Host 'Removing previous install...' -ForegroundColor Yellow
        Remove-Item -LiteralPath $TargetInstallDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $TargetInstallDir -Force | Out-Null
    Copy-Item -Path (Join-Path $sourcePath '*') -Destination $TargetInstallDir -Recurse -Force

    Remove-StaleQkrpcUserPaths -InstallDir $TargetInstallDir | Out-Null
    Add-QuickerRpcUserPath -DirectoryPath $TargetInstallDir | Out-Null

    Write-Host "Installed: $TargetInstallDir\qkrpc.exe" -ForegroundColor Green
    return $TargetInstallDir
}

function Get-QkrpcCliDownloadUrl {
    param([string]$RequestedVersion)

    if ($RequestedVersion -eq 'latest') {
        return "https://github.com/$QkrpcGitHubRepo/releases/latest/download/$QkrpcLatestZipName"
    }

    $semver = Get-QuickerRpcSemVerFromVersion -VersionText $RequestedVersion
    $tag = "v$semver"
    $zipName = "qkrpc-$semver-win-x64.zip"
    return "https://github.com/$QkrpcGitHubRepo/releases/download/$tag/$zipName"
}

function Install-QkrpcCli {
    Write-Host "Installing qkrpc to $InstallDir ..." -ForegroundColor Cyan

    $downloadUrl = Get-QkrpcCliDownloadUrl -RequestedVersion $ReleaseVersion
    Write-Host "Download: $downloadUrl" -ForegroundColor Cyan

    $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("qkrpc-install-" + [Guid]::NewGuid().ToString('N'))
    $zipPath = Join-Path $tempRoot 'qkrpc.zip'
    $extractDir = Join-Path $tempRoot 'extract'

    try {
        New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
        Install-QkrpcFromDirectory -SourceDirectory $extractDir -TargetInstallDir $InstallDir | Out-Null

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

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = Get-QkrpcDefaultInstallDir
}

if ($Uninstall) {
    Uninstall-QkrpcCli
}
else {
    Install-QkrpcCli
}
