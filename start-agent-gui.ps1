#!/usr/bin/env pwsh
# Start agent-gui web dev server (Next.js + qkrpc via start.mjs --dev).
# Prerequisite: Quicker + QuickerRpc plugin; qkrpc serve on :9477 (pwsh ./build.ps1 -t starts it).
# Examples:
#   pwsh ./start-agent-gui.ps1
#   pwsh ./start-agent-gui.ps1 -Browser

param(
    [switch]$Browser
)

$ErrorActionPreference = 'Stop'

function Test-QkrpcServeHealth {
    param(
        [string]$BaseUrl = 'http://127.0.0.1:9477',
        [int]$TimeoutSec = 2
    )
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec $TimeoutSec
        if ($resp.StatusCode -ne 200) {
            return $false
        }
        $json = $resp.Content | ConvertFrom-Json
        return $json.ok -eq $true
    }
    catch {
        return $false
    }
}

Push-Location $PSScriptRoot
try {
    $agentGui = Join-Path $PSScriptRoot 'agent-gui'
    if (-not (Test-Path -LiteralPath (Join-Path $agentGui 'package.json'))) {
        throw "agent-gui not found under $PSScriptRoot"
    }

    if (-not (Test-Path -LiteralPath (Join-Path $agentGui 'node_modules'))) {
        Write-Host "Running pnpm install in agent-gui ..." -ForegroundColor Yellow
        pnpm --dir agent-gui install
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    $llmConfig = Join-Path $agentGui 'llm-config.json'
    if (-not (Test-Path -LiteralPath $llmConfig)) {
        Write-Warning "Missing agent-gui/llm-config.json — copy from llm-config.example.json before chatting."
    }

    if (-not (Test-QkrpcServeHealth)) {
        Write-Warning "qkrpc serve not healthy at http://127.0.0.1:9477 — run pwsh ./build.ps1 -t first (or start.mjs will try staged qkrpc)."
    }

    $devScript = if ($Browser) { 'dev:browser' } else { 'dev' }
    Write-Host "=== agent-gui ($devScript) ===" -ForegroundColor Cyan
    pnpm --dir agent-gui $devScript
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
