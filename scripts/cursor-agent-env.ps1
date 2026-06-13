# Dot-source in PowerShell before using Cursor CLI in this repo:
#   . ./scripts/cursor-agent-env.ps1
#
# Sets workspace env for qkrpc + quicker-rpc; verifies `agent` is on PATH.

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$agentCmd = Get-Command agent -ErrorAction SilentlyContinue
if (-not $agentCmd) {
    $fallback = Join-Path $env:LOCALAPPDATA 'cursor-agent'
    if (Test-Path (Join-Path $fallback 'agent.cmd')) {
        $env:Path = "$fallback;$env:Path"
    }
}

if (-not (Get-Command agent -ErrorAction SilentlyContinue)) {
    throw 'Cursor CLI not found. Install from Cursor: Command Palette → "Install cursor command" / docs.cursor.com/cli'
}

$env:QKRPC_WORKSPACE_ROOT = $RepoRoot
$env:QKRPC_CWD = $RepoRoot

$cliPublish = Join-Path $RepoRoot 'publish\cli'
$qkrpcLocal = Join-Path $env:LOCALAPPDATA 'Programs\qkrpc'
$pathParts = @($cliPublish, $qkrpcLocal) | Where-Object { Test-Path $_ }
if ($pathParts.Count -gt 0) {
    $env:Path = ($pathParts -join ';') + ';' + $env:Path
}

function Test-CursorAgentAuth {
    $raw = & agent status 2>&1 | Out-String
    if ($raw -match 'Not logged in') {
        if ($env:CURSOR_API_KEY) {
            Write-Warning 'agent status: Not logged in (CURSOR_API_KEY is set — headless may still work after login once).'
            return $false
        }
        Write-Warning 'Not logged in. Run: agent login'
        return $false
    }
    return $true
}

function Get-CursorAgentVersion {
    return (& agent --version 2>&1 | Select-Object -Last 1).ToString().Trim()
}

Write-Host "cursor-agent env: repo=$RepoRoot version=$(Get-CursorAgentVersion)"
