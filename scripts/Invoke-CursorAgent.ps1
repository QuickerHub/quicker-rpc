# Headless Cursor Agent for quicker-rpc (requires agent login or CURSOR_API_KEY).
#
# Examples:
#   pwsh -NoProfile -File ./scripts/Invoke-CursorAgent.ps1 -Prompt "List top-level folders"
#   pwsh -NoProfile -File ./scripts/Invoke-CursorAgent.ps1 -Prompt "..." -NewChat
#   pwsh -NoProfile -File ./scripts/Invoke-CursorAgent.ps1 -Prompt "continue" -ChatId "<uuid>"

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Prompt,

    [string]$Workspace = '',

    [string]$ChatId = '',

    [switch]$NewChat,

    [ValidateSet('text', 'json', 'stream-json')]
    [string]$OutputFormat = 'text',

    [string]$Model = '',

    [switch]$Plan,

    [switch]$Force,

    [switch]$ApproveMcps,

    [int]$TimeoutSec = 600,
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'cursor-agent-env.ps1')

if ([string]::IsNullOrWhiteSpace($Workspace)) {
    $Workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$stateDir = Join-Path $Workspace '.cursor\agent-cli'
$chatFile = Join-Path $stateDir 'last-chat-id.txt'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

if ($NewChat -or [string]::IsNullOrWhiteSpace($ChatId)) {
    if ($NewChat -or -not (Test-Path $chatFile)) {
        $ChatId = (& agent create-chat 2>&1 | Select-Object -Last 1).ToString().Trim()
        Set-Content -Path $chatFile -Value $ChatId -NoNewline -Encoding utf8
    }
    else {
        $ChatId = (Get-Content $chatFile -Raw).Trim()
    }
}

$args = @(
    '--resume', $ChatId,
    '-p',
    '--workspace', $Workspace,
    '--output-format', $OutputFormat
)

if ($Force) { $args += '--force' }
if ($ApproveMcps) { $args += '--approve-mcps' }
if ($Plan) { $args += '--plan' }
if (-not [string]::IsNullOrWhiteSpace($Model)) { $args += @('--model', $Model) }
$args += $Prompt

Write-Host "agent chatId=$ChatId workspace=$Workspace" -ForegroundColor DarkGray

$job = Start-Job -ScriptBlock {
    param($AgentArgs)
    & agent @AgentArgs 2>&1
} -ArgumentList (,$args)

$completed = Wait-Job $job -Timeout $TimeoutSec
if (-not $completed) {
    Stop-Job $job -Force
    Remove-Job $job -Force
    throw "agent timed out after ${TimeoutSec}s (chatId=$ChatId). Check: agent login"
}

$output = Receive-Job $job
Remove-Job $job -Force
$code = if ($job.ChildJobs.Count -gt 0) { $job.ChildJobs[0].JobStateInfo.Reason } else { $null }

$output | ForEach-Object { $_ }
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
