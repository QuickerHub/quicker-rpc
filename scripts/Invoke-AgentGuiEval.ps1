# Invoke agent-gui eval harness (production /api/chat path).
#
# Examples:
#   pwsh -NoProfile -File ./scripts/Invoke-AgentGuiEval.ps1 -Preset smoke
#   pwsh -NoProfile -File ./scripts/Invoke-AgentGuiEval.ps1 -TaskId discover-step-expr -Json
#   pwsh -NoProfile -File ./scripts/Invoke-AgentGuiEval.ps1 -TaskId multi-var-assign -VerifyMock

#   pwsh -NoProfile -File ./scripts/Invoke-AgentGuiEval.ps1 -Script ui -TaskId launcher-open-hotkeys

[CmdletBinding()]
param(
    [ValidateSet('eval', 'batch', 'compare', 'test', 'ui')]
    [string] $Script = 'eval',

    [string] $TaskId = 'discover-step-expr',

    [string] $Preset = 'gui-smoke',

    [string] $Tier = '',

    [int] $Limit = 0,

    [string[]] $TaskIds = @(),

    [switch] $Json,

    [switch] $VerifyMock,

    [switch] $Judge
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path $PSScriptRoot -Parent
$guiDir = Join-Path $repoRoot 'agent-gui'

if (-not (Test-Path $guiDir)) {
    throw "Missing $guiDir — run from quicker-rpc repo root."
}

Push-Location $guiDir
try {
    switch ($Script) {
        'eval' {
            $args = @('agent-eval', '--', $TaskId)
            if ($Json) { $args += '--json' }
            if ($VerifyMock) { $args += '--verify-mock' }
            if ($Judge) { $args += '--judge' }
            pnpm @args
        }
        'batch' {
            $args = @('agent-eval:batch', '--')
            if ($Preset) { $args += @('--preset', $Preset) }
            if ($Tier) { $args += @('--tier', $Tier) }
            if ($Limit -gt 0) { $args += @('--limit', $Limit) }
            if ($TaskIds.Count -gt 0) { $args += $TaskIds }
            if ($Json) { $args += '--json' }
            if ($VerifyMock) { $args += '--verify-mock' }
            pnpm @args
        }
        'compare' {
            $args = @('agent-eval:compare', '--')
            if ($Preset) { $args += @('--preset', $Preset) }
            if ($Limit -gt 0) { $args += @('--limit', $Limit) }
            if ($Json) { $args += '--json' }
            pnpm @args
        }
        'test' {
            pnpm test:agent-eval
        }
        'ui' {
            $args = @('agent-eval:ui', '--', $TaskId)
            if ($Json) { $args += '--json' }
            if ($VerifyMock) { $args += '--verify-mock' }
            if ($Judge) { $args += '--judge' }
            pnpm @args
        }
    }
}
finally {
    Pop-Location
}
