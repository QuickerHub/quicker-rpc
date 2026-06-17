# Install quicker-rpc Cursor plugin from this repo (local clone or GitHub).
#
# Uses physical copy into ~/.cursor/plugins/local/ (Cursor rejects junctions to paths outside that tree).
#
# Examples:
#   pwsh -NoProfile -File ./scripts/install-cursor-plugin.ps1
#   pwsh -NoProfile -File ./scripts/install-cursor-plugin.ps1 -RepoUrl https://github.com/QuickerHub/quicker-rpc
#   pwsh -NoProfile -File ./scripts/install-cursor-plugin.ps1 -Uninstall

[CmdletBinding()]
param(
    [string]$RepoUrl = '',
    [string]$Branch = 'main',
    [string]$InstallDir = (Join-Path $env:USERPROFILE '.cursor\plugins\local\quicker-rpc'),
    [string]$CloneDir = (Join-Path $env:USERPROFILE '.cursor\plugins\repos\quicker-rpc'),
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$localPluginsRoot = Join-Path $env:USERPROFILE '.cursor\plugins\local'

if ($Uninstall) {
    if (Test-Path $InstallDir) {
        Remove-Item -LiteralPath $InstallDir -Recurse -Force
        Write-Host "Removed plugin: $InstallDir"
    }
    else {
        Write-Host "Plugin not found: $InstallDir"
    }
    Write-Host 'Cursor reloads local plugins automatically after reinstall.'
    exit 0
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$fromLocalRepo = [string]::IsNullOrWhiteSpace($RepoUrl)

if (-not $fromLocalRepo) {
    $reposParent = Split-Path $CloneDir -Parent
    if (-not (Test-Path $reposParent)) {
        New-Item -ItemType Directory -Force -Path $reposParent | Out-Null
    }

    if (Test-Path (Join-Path $CloneDir '.git')) {
        Write-Host "Updating $CloneDir ..."
        git -C $CloneDir fetch --depth 1 origin $Branch
        git -C $CloneDir checkout $Branch
        git -C $CloneDir pull --ff-only origin $Branch
    }
    else {
        if (Test-Path $CloneDir) {
            Remove-Item -LiteralPath $CloneDir -Recurse -Force
        }
        Write-Host "Cloning $RepoUrl (branch $Branch) -> $CloneDir ..."
        git clone --depth 1 --branch $Branch $RepoUrl $CloneDir
    }

    $repoRoot = $CloneDir
}

$pluginSource = Join-Path $repoRoot 'cursor-plugin\quicker-rpc'

if (-not (Test-Path (Join-Path $pluginSource '.cursor-plugin\plugin.json'))) {
    throw "Plugin root not found: $pluginSource (expected .cursor-plugin/plugin.json)"
}

$syncScript = Join-Path $repoRoot 'scripts\sync-cursor-plugin.ps1'
if (Test-Path $syncScript) {
    & pwsh -NoProfile -File $syncScript
}

if (-not (Test-Path $localPluginsRoot)) {
    New-Item -ItemType Directory -Force -Path $localPluginsRoot | Out-Null
}

if (Test-Path $InstallDir) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
}

Write-Host "Copying plugin to $InstallDir ..."
Copy-Item -LiteralPath $pluginSource -Destination $InstallDir -Recurse -Force

if (-not (Test-Path (Join-Path $InstallDir '.cursor-plugin\plugin.json'))) {
    throw "Install failed: missing .cursor-plugin/plugin.json in $InstallDir"
}

Write-Host ''
Write-Host 'Installed quicker-rpc Cursor plugin (physical copy):'
Write-Host "  dir:    $InstallDir"
Write-Host "  source: $pluginSource"
Write-Host ''
Write-Host 'Next:'
Write-Host '  1. Cursor reloads the plugin automatically (no need to quit)'
Write-Host '  2. Settings -> MCP: enable qkrpc if not already on'
Write-Host '  3. Settings -> Plugins: may show under Installed / Local'
Write-Host ''
Write-Host 'Update: re-run this script (copies fresh bundle).'
Write-Host 'Uninstall: pwsh -NoProfile -File ./scripts/install-cursor-plugin.ps1 -Uninstall'
