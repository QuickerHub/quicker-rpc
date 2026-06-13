#!/usr/bin/env pwsh
# Run ActionRuntime combined test report (compile + execution equivalence).
param(
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$AuthoredDir = Join-Path $Root "docs/authoring-references/step-modules/authored"
$ActionRuntime = Join-Path $Root "Quicker.ActionRuntime"

if (-not (Test-Path $AuthoredDir)) {
    throw "Module authored refs not found: $AuthoredDir"
}

$env:QUICKER_MODULE_AUTHORED_DIR = $AuthoredDir
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
