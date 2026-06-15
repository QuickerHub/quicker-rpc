# Nightly agent-gui eval (local or workflow_dispatch).
#
# Prerequisites on the runner machine:
#   - agent-gui dev server (pnpm dev)
#   - qkrpc serve + Quicker plugin
#   - LLM configured
#
# Examples:
#   pwsh ./scripts/Invoke-AgentEvalNightly.ps1
#   pwsh ./scripts/Invoke-AgentEvalNightly.ps1 -Preset gui-agent-defs
#   pwsh ./scripts/Invoke-AgentEvalNightly.ps1 -SkipLive

[CmdletBinding()]
param(
    [string] $Preset = 'gui-smoke',

    [int] $Limit = 0,

    [switch] $VerifyMock,

    [switch] $Json,

    [switch] $SkipLive,

    [switch] $UnitOnly
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path $PSScriptRoot -Parent
$guiDir = Join-Path $repoRoot 'agent-gui'

Push-Location $guiDir
try {
    if ($UnitOnly) {
        pnpm test:agent-eval
        exit $LASTEXITCODE
    }

    $args = @('agent-eval:nightly', '--', '--preset', $Preset)
    if ($Limit -gt 0) { $args += @('--limit', $Limit) }
    if ($VerifyMock) { $args += '--verify-mock' }
    if ($Json) { $args += '--json' }
    if ($SkipLive) { $args += '--skip-live' }
    pnpm @args
}
finally {
    Pop-Location
}
