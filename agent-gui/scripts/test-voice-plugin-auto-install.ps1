#!/usr/bin/env pwsh
# Voice plugin auto-install trigger test helper.
#
# Examples:
#   pwsh ./agent-gui/scripts/test-voice-plugin-auto-install.ps1
#   pwsh ./agent-gui/scripts/test-voice-plugin-auto-install.ps1 trigger-check
#   pwsh ./agent-gui/scripts/test-voice-plugin-auto-install.ps1 probe-urls
#   pwsh ./agent-gui/scripts/test-voice-plugin-auto-install.ps1 reset -Yes
#   pwsh ./agent-gui/scripts/test-voice-plugin-auto-install.ps1 console

param(
    [ValidateSet('status', 'trigger-check', 'probe-urls', 'reset', 'console')]
    [string]$Command = 'status',

    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'agent-gui/package.json'))) {
    $repoRoot = Split-Path -Parent $PSScriptRoot
}
$agentGui = Join-Path $repoRoot 'agent-gui'
$mjs = Join-Path $agentGui 'scripts/test-voice-plugin-auto-install.mjs'

if (-not (Test-Path -LiteralPath $mjs)) {
    throw "Missing $mjs"
}

$nodeArgs = @($mjs, $Command)
if ($Command -eq 'reset') {
    if (-not $Yes) {
        Write-Host 'Reset moves plugin dirs to *.bak-<timestamp>. Pass -Yes to confirm.' -ForegroundColor Yellow
    }
    if ($Yes) {
        $nodeArgs += '--yes'
    }
}
if ($Command -eq 'console') {
    $nodeArgs[1] = 'print-console'
}

Write-Host "=== voice plugin auto-install test: $Command ===" -ForegroundColor Cyan
& node @nodeArgs
exit $LASTEXITCODE
