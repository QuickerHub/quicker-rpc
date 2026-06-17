# Install quicker-rpc Codex plugin (personal marketplace + plugin copy).
#
# Codex resolves marketplace source.path from $HOME (e.g. ./.codex/plugins/quicker-rpc).
#
# Examples:
#   pwsh -NoProfile -File ./scripts/install-codex-plugin.ps1
#   pwsh -NoProfile -File ./scripts/install-codex-plugin.ps1 -RepoUrl https://github.com/QuickerHub/quicker-rpc
#   pwsh -NoProfile -File ./scripts/install-codex-plugin.ps1 -Uninstall

[CmdletBinding()]
param(
    [string]$RepoUrl = '',
    [string]$Branch = 'main',
    [string]$PluginDir = (Join-Path $env:USERPROFILE '.codex\plugins\quicker-rpc'),
    [string]$MarketplaceFile = (Join-Path $env:USERPROFILE '.agents\plugins\marketplace.json'),
    [string]$CloneDir = (Join-Path $env:USERPROFILE '.agents\plugins\repos\quicker-rpc'),
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

function Resolve-QkrpcExe {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\qkrpc\qkrpc.exe'),
        (Get-Command qkrpc -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath $c)) {
            return (Resolve-Path -LiteralPath $c).Path
        }
    }
    throw 'qkrpc.exe not found. Install from https://github.com/QuickerHub/quicker-rpc/releases/latest'
}

function Set-QkrpcMcpConfig([string]$PluginRoot, [string]$QkrpcExe) {
    $mcpPath = Join-Path $PluginRoot '.mcp.json'
    # Codex plugin .mcp.json uses camelCase mcpServers (not config.toml mcp_servers).
    $mcp = @{
        mcpServers = @{
            qkrpc = @{
                command = $QkrpcExe
                args = @('mcp')
            }
        }
    }
    ($mcp | ConvertTo-Json -Depth 6) + "`n" | Set-Content -LiteralPath $mcpPath -Encoding utf8
}

$marketplaceParent = Split-Path $MarketplaceFile -Parent
$legacyPluginDir = Join-Path $env:USERPROFILE '.agents\plugins\quicker-rpc'

if ($Uninstall) {
    foreach ($dir in @($PluginDir, $legacyPluginDir)) {
        if (Test-Path $dir) {
            Remove-Item -LiteralPath $dir -Recurse -Force
            Write-Host "Removed plugin: $dir"
        }
    }
    if (Test-Path $MarketplaceFile) {
        try {
            $mp = Get-Content -LiteralPath $MarketplaceFile -Raw | ConvertFrom-Json
            if ($mp.plugins) {
                $mp.plugins = @($mp.plugins | Where-Object { $_.name -ne 'quicker-rpc' })
                ($mp | ConvertTo-Json -Depth 10) + "`n" | Set-Content -LiteralPath $MarketplaceFile -Encoding utf8
                Write-Host "Removed quicker-rpc from $MarketplaceFile"
            }
        }
        catch {
            Write-Host "Could not update marketplace.json: $($_.Exception.Message)"
        }
    }
    Write-Host 'Restart Codex or run /plugins to refresh.'
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

$pluginSource = Join-Path $repoRoot 'codex-plugin\quicker-rpc'

if (-not (Test-Path (Join-Path $pluginSource '.codex-plugin\plugin.json'))) {
    throw "Plugin root not found: $pluginSource (expected .codex-plugin/plugin.json)"
}

$syncScript = Join-Path $repoRoot 'scripts\sync-codex-plugin.ps1'
if (Test-Path $syncScript) {
    & pwsh -NoProfile -File $syncScript
}

$qkrpcExe = Resolve-QkrpcExe

if (-not (Test-Path $marketplaceParent)) {
    New-Item -ItemType Directory -Force -Path $marketplaceParent | Out-Null
}

$pluginParent = Split-Path $PluginDir -Parent
if (-not (Test-Path $pluginParent)) {
    New-Item -ItemType Directory -Force -Path $pluginParent | Out-Null
}

foreach ($dir in @($PluginDir, $legacyPluginDir)) {
    if (Test-Path $dir) {
        Remove-Item -LiteralPath $dir -Recurse -Force
    }
}

Write-Host "Copying plugin to $PluginDir ..."
Copy-Item -LiteralPath $pluginSource -Destination $PluginDir -Recurse -Force
Set-QkrpcMcpConfig -PluginRoot $PluginDir -QkrpcExe $qkrpcExe

if (-not (Test-Path (Join-Path $PluginDir '.codex-plugin\plugin.json'))) {
    throw "Install failed: missing .codex-plugin/plugin.json in $PluginDir"
}

# Path is relative to $HOME per Codex personal marketplace docs.
$relativePluginPath = './.codex/plugins/quicker-rpc'
$marketplace = @{
    name = 'quickerhub'
    interface = @{
        displayName = 'QuickerHub'
    }
    metadata = @{
        description = 'Quicker action authoring for Codex (qkrpc MCP)'
    }
    plugins = @(
        @{
            name = 'quicker-rpc'
            source = @{
                source = 'local'
                path = $relativePluginPath
            }
            policy = @{
                installation = 'AVAILABLE'
                authentication = 'ON_USE'
            }
            category = 'Productivity'
            interface = @{
                displayName = 'Quicker RPC'
                shortDescription = 'Headless Quicker action authoring via qkrpc MCP'
            }
        }
    )
}

if (Test-Path $MarketplaceFile) {
    try {
        $existing = Get-Content -LiteralPath $MarketplaceFile -Raw | ConvertFrom-Json
        $others = @()
        if ($existing.plugins) {
            $others = @($existing.plugins | Where-Object { $_.name -ne 'quicker-rpc' })
        }
        $marketplace.plugins = @($marketplace.plugins) + $others
        if ($existing.name) { $marketplace.name = $existing.name }
        if ($existing.interface) { $marketplace.interface = $existing.interface }
    }
    catch {
        Write-Host "Warning: could not merge existing marketplace.json, overwriting."
    }
}

($marketplace | ConvertTo-Json -Depth 10) + "`n" | Set-Content -LiteralPath $MarketplaceFile -Encoding utf8

Write-Host ''
Write-Host 'Installed quicker-rpc Codex plugin:'
Write-Host "  plugin:      $PluginDir"
Write-Host "  marketplace: $MarketplaceFile"
Write-Host "  mcp command: $qkrpcExe"
Write-Host ''
Write-Host 'Next:'
Write-Host '  1. Restart Codex (or /plugins) and install quicker-rpc from QuickerHub marketplace'
Write-Host '  2. Verify: codex mcp list'
Write-Host ''
Write-Host 'Update: re-run this script.'
Write-Host 'Uninstall: pwsh -NoProfile -File ./scripts/install-codex-plugin.ps1 -Uninstall'
