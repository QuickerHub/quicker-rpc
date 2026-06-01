#!/usr/bin/env pwsh
# Backward-compatible alias for Publish-QuickerAgent.ps1
& (Join-Path $PSScriptRoot 'Publish-QuickerAgent.ps1') @args
exit $LASTEXITCODE
