# Build a clean orphan git branch for Cursor plugin distribution.
#
# Branch `cursor-plugin` contains ONLY the plugin bundle (skills/rules committed).
# Edit sources on main: docs/skills/, docs/agent-rules/ — then re-run this script.
#
# Usage:
#   pwsh -NoProfile -File ./scripts/publish-cursor-plugin-branch.ps1
#   pwsh -NoProfile -File ./scripts/publish-cursor-plugin-branch.ps1 -Push

[CmdletBinding()]
param(
    [string]$Branch = 'cursor-plugin',
    [string]$StagePath = '',
    [switch]$Push,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '..\publish\qkrpc-publish-lib.ps1')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ([string]::IsNullOrWhiteSpace($StagePath)) {
    $StagePath = Join-Path $repoRoot '.build\cursor-plugin-stage'
}

$pluginSource = Join-Path $repoRoot 'cursor-plugin\quicker-rpc'
$syncScript = Join-Path $repoRoot 'scripts\sync-cursor-plugin.ps1'

function Copy-Tree([string]$source, [string]$dest) {
    if (Test-Path $dest) {
        Remove-Item -LiteralPath $dest -Recurse -Force
    }
    Copy-Item -LiteralPath $source -Destination $dest -Recurse -Force
}

Write-Host "Syncing plugin assets from docs/skills ..."
& pwsh -NoProfile -File $syncScript

if (-not (Test-Path (Join-Path $pluginSource '.cursor-plugin\plugin.json'))) {
    throw "Missing plugin manifest after sync: $pluginSource"
}

if ($DryRun) {
    Write-Host "[DryRun] Would publish orphan branch '$Branch' from $pluginSource"
    exit 0
}

$version = (Get-Content (Resolve-QuickerRpcVersionJsonPath -MonorepoRoot $repoRoot) -Raw | ConvertFrom-Json).QuickerRpc

if (Test-Path $StagePath) {
    Remove-Item -LiteralPath $StagePath -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $StagePath | Out-Null

Get-ChildItem -LiteralPath $pluginSource -Force | ForEach-Object {
    Copy-Tree $_.FullName (Join-Path $StagePath $_.Name)
}

$marketplaceDir = Join-Path $StagePath '.cursor-plugin'
New-Item -ItemType Directory -Force -Path $marketplaceDir | Out-Null
$marketplace = @{
    name = 'quickerhub'
    owner = @{ name = 'QuickerHub' }
    metadata = @{
        description = 'Quicker action authoring for Cursor (qkrpc MCP)'
    }
    plugins = @(
        @{
            name = 'quicker-rpc'
            source = '.'
            description = 'Headless Quicker action authoring: qkrpc MCP, skills, rules (P0–P7)'
        }
    )
}
($marketplace | ConvertTo-Json -Depth 6) + "`n" | Set-Content -Path (Join-Path $marketplaceDir 'marketplace.json') -Encoding utf8

$installPs1 = @'
# Install this plugin into Cursor (physical copy).
$ErrorActionPreference = 'Stop'
$dest = Join-Path $env:USERPROFILE '.cursor\plugins\local\quicker-rpc'
$src = $PSScriptRoot
if (Test-Path $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
Copy-Item -LiteralPath $src -Destination $dest -Recurse -Force
Write-Host "Installed to $dest"
Write-Host "Cursor reloads local plugins automatically; enable qkrpc in Settings -> MCP if needed."
'@
Set-Content -Path (Join-Path $StagePath 'install.ps1') -Value $installPs1 -Encoding utf8

$branchReadme = @"
# quicker-rpc — Cursor plugin (release branch)

Auto-generated branch. Edit ``docs/skills/`` on ``main``, then run ``publish-cursor-plugin-branch.ps1``.

## Prerequisites

- Windows, [qkrpc CLI](https://github.com/QuickerHub/quicker-rpc/releases/latest)
- Quicker with QuickerRpc plugin loaded

## Install

``````powershell
git clone --depth 1 -b cursor-plugin https://github.com/QuickerHub/quicker-rpc quicker-rpc-cursor-plugin
cd quicker-rpc-cursor-plugin
pwsh -NoProfile -File ./install.ps1
``````

Teams: Import from Repo → branch ``cursor-plugin``. Reinstall updates auto-reload in Cursor.

Version: $version
"@
Set-Content -Path (Join-Path $StagePath 'README.md') -Value $branchReadme -Encoding utf8

Write-Host "Committing staged plugin to temporary git repo ..."
Push-Location $StagePath
git init -b $Branch
git add -A
git commit -m "chore(cursor-plugin): release $version"
$stageGit = Join-Path $StagePath '.git'
Pop-Location

git -C $repoRoot branch -D $Branch 2>$null
git -C $repoRoot fetch $stageGit $Branch`:$Branch

$commit = git -C $repoRoot rev-parse --short $Branch
Write-Host ''
Write-Host "Branch '$Branch' updated (commit $commit)"
Write-Host '  clone: git clone --depth 1 -b cursor-plugin https://github.com/QuickerHub/quicker-rpc quicker-rpc-cursor-plugin'
Write-Host '  push:  git push -u origin cursor-plugin'

if ($Push) {
    git -C $repoRoot push -u origin $Branch
    Write-Host "Pushed origin/$Branch"
}
