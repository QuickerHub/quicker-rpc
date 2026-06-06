#!/usr/bin/env pwsh
# QuickerAgent — unified dev launcher (pick ONE mode; do not run both at once).
#
#   pwsh ./start-agent-gui.ps1           # Browser UI @ :3000 (Turbopack, fast HMR)
#   pwsh ./start-agent-gui.ps1 -Tauri    # Desktop QuickerAgent (webpack + WebView2)
#
# Optional:
#   -Browser   open http://127.0.0.1:3000 after start (browser mode only)
#   -Full      eager-start voice runtime at boot (browser mode)
#   -SkipKill  do not stop prior dev on :3000
#
# Prerequisite: Quicker + QuickerRpc plugin; qkrpc serve on :9477 (pwsh ./build.ps1 -t).

param(
    [switch]$Tauri,
    [switch]$Browser,
    [switch]$SkipKill,
    [switch]$Full
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

function Stop-ProcessTree {
    param([int]$ProcessId)

    if ($ProcessId -le 0 -or $ProcessId -eq $PID) {
        return $false
    }
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
}

function Get-AgentGuiDevPort {
    $raw = $env:AGENT_GUI_PORT
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        $parsed = 0
        if ([int]::TryParse($raw.Trim(), [ref]$parsed) -and $parsed -gt 0) {
            return $parsed
        }
    }
    return 3000
}

function Stop-AgentGuiDev {
    param(
        [string]$AgentGuiRoot,
        [string]$RepoRoot
    )

    $stopScript = Join-Path $AgentGuiRoot 'scripts/stop-agent-gui-dev.mjs'
    if (-not (Test-Path -LiteralPath $stopScript)) {
        Write-Warning "Missing $stopScript; skip stopping prior dev."
        return
    }

    node $stopScript
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

function Ensure-AgentGuiDeps {
    param([string]$AgentGuiRoot)

    if (-not (Test-Path -LiteralPath (Join-Path $AgentGuiRoot 'node_modules'))) {
        Write-Host "Running pnpm install in agent-gui ..." -ForegroundColor Yellow
        pnpm --dir $AgentGuiRoot install
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    $llmConfig = Join-Path $AgentGuiRoot 'llm-config.json'
    if (-not (Test-Path -LiteralPath $llmConfig)) {
        Write-Warning "Missing agent-gui/llm-config.json — copy from llm-config.example.json before chatting."
    }

    if (-not (Test-QkrpcServeHealth)) {
        Write-Warning "qkrpc serve not healthy at http://127.0.0.1:9477 — run pwsh ./build.ps1 -t first (start.mjs will try staged qkrpc)."
    }
}

Push-Location $PSScriptRoot
try {
    $agentGui = Join-Path $PSScriptRoot 'agent-gui'
    if (-not (Test-Path -LiteralPath (Join-Path $agentGui 'package.json'))) {
        throw "agent-gui not found under $PSScriptRoot"
    }

    if (-not $SkipKill) {
        Stop-AgentGuiDev -AgentGuiRoot $agentGui -RepoRoot $PSScriptRoot
        Remove-Item Env:AGENT_GUI_SKIP_KILL -ErrorAction SilentlyContinue
    }
    else {
        $env:AGENT_GUI_SKIP_KILL = '1'
    }

    Ensure-AgentGuiDeps -AgentGuiRoot $agentGui

    $nextDir = Join-Path $agentGui '.next'
    $documentJs = Join-Path $nextDir 'server/pages/_document.js'
    $ssrChunks = Join-Path $nextDir 'server/chunks/ssr'
    $hasBrokenTurbopack = $false
    if ((Test-Path -LiteralPath $documentJs) -and
        (Select-String -LiteralPath $documentJs -Pattern '\[turbopack\]_runtime' -Quiet -ErrorAction SilentlyContinue)) {
        $hasRuntimeChunk = (Test-Path -LiteralPath (Join-Path $nextDir 'turbopack')) -or
            ((Test-Path -LiteralPath $ssrChunks) -and
             (Get-ChildItem -LiteralPath $ssrChunks -File -ErrorAction SilentlyContinue |
              Where-Object { $_.Name -match '\[turbopack\]_runtime' } |
              Select-Object -First 1))
        if (-not $hasRuntimeChunk) {
            $hasBrokenTurbopack = $true
        }
    }
    if ($hasBrokenTurbopack) {
        Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleared broken Turbopack .next cache." -ForegroundColor Yellow
    }

    if ($Tauri) {
        $nextDir = Join-Path $agentGui '.next'
        $documentJs = Join-Path $nextDir 'server/pages/_document.js'
        $hasTurbopackCache = (Test-Path -LiteralPath (Join-Path $nextDir 'turbopack')) -or
            ((Test-Path -LiteralPath $documentJs) -and
             (Select-String -LiteralPath $documentJs -Pattern '\[turbopack\]_runtime' -Quiet -ErrorAction SilentlyContinue))
        if ($hasTurbopackCache) {
            Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "Cleared Turbopack .next before webpack Tauri dev." -ForegroundColor Yellow
        }

        Write-Host ""
        Write-Host "=== QuickerAgent desktop (webpack + Tauri) ===" -ForegroundColor Cyan
        Write-Host "  UI: http://127.0.0.1:3000 inside WebView2" -ForegroundColor DarkGray
        Write-Host "  Do not run browser mode in parallel." -ForegroundColor DarkGray
        Write-Host ""
        pnpm --dir $agentGui tauri:dev
        exit $LASTEXITCODE
    }

    if ($Full) {
        $env:AGENT_GUI_VOICE_RUNTIME = '1'
        Write-Host "Voice runtime: eager-start at boot (-Full)." -ForegroundColor DarkGray
    }

    $devScript = if ($Browser) { 'dev:browser' } elseif ($Full) { 'dev:full' } else { 'dev' }
    Write-Host ""
    Write-Host "=== QuickerAgent browser dev (Turbopack) ===" -ForegroundColor Cyan
    Write-Host "  UI: http://127.0.0.1:3000" -ForegroundColor DarkGray
    Write-Host "  Desktop shell: pwsh ./start-agent-gui.ps1 -Tauri" -ForegroundColor DarkGray
    Write-Host ""
    pnpm --dir $agentGui $devScript
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
