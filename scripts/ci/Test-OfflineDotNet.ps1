#!/usr/bin/env pwsh
# No installed Quicker, qkbuild, hot update, or live RPC tests are used here.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Invoke-DotNet {
    param([string[]]$Arguments)
    & dotnet @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

Push-Location $repoRoot
try {
    if ($IsWindows) { & (Join-Path $PSScriptRoot 'Test-QkrpcInstallOverlay.ps1') }
    # Check first; disabling MSBuild generation must never mask stale knowledge.
    & node scripts/generate-authoring-docs.mjs --check
    if ($LASTEXITCODE -ne 0) { throw 'Generated knowledge check failed' }

    $common = @('-c', 'Release', '-p:GenerateActionAuthoringDocs=false', '--verbosity', 'minimal')
    foreach ($project in @('QuickerRpc.Runtime', 'QuickerRpc.Transport')) {
        # These shared libraries target net472/netstandard2.0/net10.0 without host DLLs.
        Invoke-DotNet -Arguments (@('build', "QuickerRpc/src/$project/$project.csproj") + $common)
    }

    foreach ($project in @('QuickerRpc.Console.Test', 'QuickerRpc.Transport.Test', 'QuickerRpc.Runtime.Test')) {
        $arguments = @('test', "QuickerRpc/tests/$project/$project.csproj") + $common + @(
            '--logger', 'trx', '--results-directory', ".tmp/ci-results/$project"
        )
        if ($project -eq 'QuickerRpc.Runtime.Test') {
            # Excludes the V2 plugin reference and its five host-dependent test files.
            $arguments += '-p:IncludeV2HostTests=false'
        }
        if ($project -eq 'QuickerRpc.Console.Test' -and $env:GITHUB_ACTIONS -ne 'true') {
            # This existing test defaults to the user's MCP config; hosted runners are fresh.
            Write-Host 'Local only: exclude RunCheck_DetectsMissingManifest to avoid reading user MCP config.'
            $arguments += @('--filter', 'FullyQualifiedName!~RunCheck_DetectsMissingManifest')
        }
        Invoke-DotNet -Arguments $arguments
    }
}
finally {
    Pop-Location
}
