#!/usr/bin/env pwsh
# Run ActionRuntime combined test report (compile + execution equivalence).
param(
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ExamplesDir = Join-Path $Root "docs/action-authoring-src/references/step-modules/examples"
$ActionRuntime = Join-Path $Root "Quicker.ActionRuntime"

if (-not (Test-Path $ExamplesDir)) {
    throw "Module examples not found: $ExamplesDir"
}

$env:QUICKER_MODULE_EXAMPLES_DIR = $ExamplesDir
Push-Location $ActionRuntime
try {
    if ($NoOpen) {
        npm run test:compile-report:ci
    } else {
        npm run test:compile-report
    }
} finally {
    Pop-Location
}
