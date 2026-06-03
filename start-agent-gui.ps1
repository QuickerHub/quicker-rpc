#!/usr/bin/env pwsh
# Start agent-gui web dev server (Next.js + qkrpc via start.mjs --dev).
# Kills any prior agent-gui dev session before starting (port + process scan).
# Prerequisite: Quicker + QuickerRpc plugin; qkrpc serve on :9477 (pwsh ./build.ps1 -t starts it).
# Examples:
#   pwsh ./start-agent-gui.ps1
#   pwsh ./start-agent-gui.ps1 -Browser
#   pwsh ./start-agent-gui.ps1 -SkipKill

param(
    [switch]$Browser,
    [switch]$SkipKill
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

    $agentGuiNorm = (Resolve-Path -LiteralPath $AgentGuiRoot).Path.ToLower()
    $repoNorm = (Resolve-Path -LiteralPath $RepoRoot).Path.ToLower()
    $stopped = [System.Collections.Generic.HashSet[int]]::new()

    foreach ($proc in (Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
        if ($proc.ProcessId -eq $PID) {
            continue
        }

        $cmd = $proc.CommandLine
        if ([string]::IsNullOrWhiteSpace($cmd)) {
            continue
        }

        $cmdLower = $cmd.ToLower()
        $isAgentGuiDev = $false

        if ($proc.Name -eq 'pwsh.exe' -and $cmdLower -match 'start-agent-gui\.ps1') {
            $isAgentGuiDev = $cmdLower -like "*$repoNorm*"
        }
        elseif ($proc.Name -in @('node.exe', 'pnpm.exe', 'cmd.exe')) {
            if ($cmdLower -like "*$agentGuiNorm*") {
                $isAgentGuiDev = (
                    $cmdLower -match 'start\.mjs' -or
                    $cmdLower -match '\bnext(\.cmd)?\b' -or
                    $cmdLower -match '\bdev(:browser)?\b'
                )
            }
        }

        if (-not $isAgentGuiDev) {
            continue
        }

        if (Stop-ProcessTree -ProcessId $proc.ProcessId) {
            $null = $stopped.Add($proc.ProcessId)
        }
    }

    $port = Get-AgentGuiDevPort
    try {
        $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)
        foreach ($conn in $listeners) {
            $ownerPid = [int]$conn.OwningProcess
            if ($ownerPid -le 0 -or $ownerPid -eq $PID) {
                continue
            }
            if (Stop-ProcessTree -ProcessId $ownerPid) {
                $null = $stopped.Add($ownerPid)
            }
        }
    }
    catch {
        # Get-NetTCPConnection unavailable or port free
    }

    if ($stopped.Count -gt 0) {
        Write-Host "Stopped prior agent-gui dev (PID(s): $(@($stopped) -join ', '))." -ForegroundColor Yellow
        Start-Sleep -Seconds 1
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
