# Run Cursor SDK scripts for quicker-rpc (requires CURSOR_API_KEY or agent login).
#
# Examples:
#   pwsh -NoProfile -File ./scripts/Invoke-CursorSdk.ps1
#   pwsh -NoProfile -File ./scripts/Invoke-CursorSdk.ps1 -Script benchmark -TaskId discover-step-expr
#   pwsh -NoProfile -File ./scripts/Invoke-CursorSdk.ps1 -WithQkrpc

[CmdletBinding()]
param(
    [ValidateSet('hello', 'benchmark', 'benchmark-batch', 'check', 'install')]
    [string] $Script = 'hello',

    [string] $TaskId = 'discover-step-expr',

    [string] $Preset = '',

    [string] $Tier = '',

    [int] $Limit = 0,

    [string[]] $TaskIds = @(),

    [switch] $WithQkrpc,

    [switch] $Minimal,

    [switch] $Json,

    [switch] $VerifyMock
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'cursor-agent-env.ps1')

$sdkDir = Join-Path $PSScriptRoot 'sdk'
if (-not (Test-Path $sdkDir)) {
    throw "Missing $sdkDir — run from quicker-rpc repo root."
}

if (-not $env:CURSOR_API_KEY) {
    Write-Warning 'CURSOR_API_KEY not set. Set it from Cursor Dashboard → API Keys, or run: agent login'
}

Push-Location $sdkDir
try {
    if ($Script -eq 'install' -or -not (Test-Path (Join-Path $sdkDir 'node_modules'))) {
        Write-Host 'npm install (scripts/sdk)…' -ForegroundColor DarkGray
        npm install --no-fund --no-audit
    }

    switch ($Script) {
        'hello' {
            $args = @('run', 'hello', '--')
            if ($WithQkrpc) { $args += '--with-qkrpc' }
            if ($Minimal) { $args += '--minimal' }
            npm @args
        }
        'benchmark' {
            $args = @('run', 'benchmark', '--', $TaskId)
            if ($Json) { $args += '--json' }
            if ($VerifyMock) { $args += '--verify-mock' }
            npm @args
        }
        'benchmark-batch' {
            $args = @('run', 'benchmark:batch', '--')
            if ($Preset) { $args += @('--preset', $Preset) }
            if ($Tier) { $args += @('--tier', $Tier) }
            if ($Limit -gt 0) { $args += @('--limit', $Limit) }
            if ($TaskIds.Count -gt 0) { $args += $TaskIds }
            if ($Json) { $args += '--json' }
            npm @args
        }
        'check' {
            npm run check
        }
        'install' {
            Write-Host 'scripts/sdk dependencies installed.' -ForegroundColor Green
        }
    }
}
finally {
    Pop-Location
}
