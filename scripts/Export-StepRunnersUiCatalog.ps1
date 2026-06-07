#!/usr/bin/env pwsh
# Export step-runner get-ui schemas to agent-gui static catalog (compile-time bundle).
# Prereq: Quicker running + QuickerRpc plugin loaded; qkrpc on PATH or after build.ps1 -t.
# Usage:
#   pwsh -NoProfile -File ./scripts/Export-StepRunnersUiCatalog.ps1
#   pwsh -NoProfile -File ./scripts/Export-StepRunnersUiCatalog.ps1 -Limit 50

param(
    [int]$Limit = 500,
    [string]$OutFile = (Join-Path $PSScriptRoot '..\agent-gui\lib\action-editor\data\step-runners-ui-catalog.json')
)

$ErrorActionPreference = 'Stop'
$nodeScript = Join-Path $PSScriptRoot 'export-step-runners-ui-catalog.mjs'
& node $nodeScript "--limit=$Limit" "--out=$OutFile"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
