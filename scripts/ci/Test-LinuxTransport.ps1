#!/usr/bin/env pwsh
# Generated same-UID pipe peers only; never discover or start an installed host.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsLinux) { throw 'This gate requires an actual Linux runtime.' }
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$run = Join-Path $repoRoot ".tmp/ci-results/transport-linux/run-$([Guid]::NewGuid().ToString('N'))"
$null = New-Item -ItemType Directory -Path $run -Force
$report = [ordered]@{
    format = 'quicker-rpc-linux-transport'; version = 1; ok = $false; phase = 'knowledge'
    os = [Runtime.InteropServices.RuntimeInformation]::OSDescription
    architecture = [Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
    head = $null; tests = $null; consumer = $null; error = $null
}
function Invoke-DotNet([string[]]$Arguments) {
    & dotnet @Arguments
    if ($LASTEXITCODE -ne 0) { throw "dotnet $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

Push-Location $repoRoot
try {
    $report.head = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Could not identify the tested commit' }
    Invoke-DotNet -Arguments @('--info')
    & node scripts/generate-authoring-docs.mjs --check
    if ($LASTEXITCODE -ne 0) { throw 'Generated knowledge check failed' }

    $common = @('-c', 'Release', '-p:GenerateActionAuthoringDocs=false', '--verbosity', 'minimal')
    $report.phase = 'build'
    # net472 is compile-only here; SDK restores reference assemblies, not a host.
    Invoke-DotNet -Arguments (@('build', 'QuickerRpc/src/QuickerRpc.Transport/QuickerRpc.Transport.csproj') + $common)

    $report.phase = 'transport-tests'
    Invoke-DotNet -Arguments (@('test', 'QuickerRpc/tests/QuickerRpc.Transport.Test/QuickerRpc.Transport.Test.csproj',
        '--framework', 'net10.0', '--logger', 'trx;LogFileName=transport.trx', '--results-directory', $run) + $common)
    [xml]$trx = Get-Content -LiteralPath (Join-Path $run 'transport.trx') -Raw
    $counters = $trx.TestRun.ResultSummary.Counters
    $results = @($trx.TestRun.Results.UnitTestResult)
    $definitions = @{}
    foreach ($definition in @($trx.TestRun.TestDefinitions.UnitTest)) {
        $definitions[[string]$definition.id] = $definition.TestMethod
    }
    # These candidate PR75 cases explicitly require Windows owner/SID/ACL APIs.
    # Their unsupported outcomes are reported, never counted as Linux coverage.
    $windowsOnly = @(
        'Production_server_owner_and_protected_DACL_allow_same_user_handshake_and_binding_Async',
        'Owner_gate_uses_user_SID_and_rejects_other_or_unknown_owners',
        'Actual_connected_handle_is_checked_and_unreadable_owner_is_not_accepted_Async',
        'Elevated_token_rejects_token_group_owner_before_handshake_and_closes_pipe_Async',
        'Already_cancelled_connection_does_not_start_handshake_Async'
    )
    $unsupported = @()
    foreach ($result in $results) {
        if ($result.outcome -eq 'Passed') { continue }
        $method = $definitions[[string]$result.testId]
        if ($result.outcome -ne 'NotExecuted' -or $null -eq $method -or
            $method.className -ne 'QuickerRpc.Transport.Test.PipeClientSecurityTests' -or $method.name -notin $windowsOnly) {
            throw "Unexpected Linux test outcome: $($result.testName) = $($result.outcome)"
        }
        $unsupported += [string]$result.testName
        Write-Host "Windows-only unsupported on Linux: $($result.testName)"
    }
    $requiredClasses = @('ActionProgramSourceContractTests', 'FontAwesomePageContractTests', 'HostBindingTests',
        'HostSessionContractTests', 'MethodPolicyTests', 'QuickerRpcPipeNamesTests', 'ServerBindingGuardTests',
        'StepRunnerInputContractTests', 'UnixPipeContractTests')
    foreach ($class in $requiredClasses) {
        $passed = @($results | Where-Object {
            $_.outcome -eq 'Passed' -and $definitions[[string]$_.testId].className -eq "QuickerRpc.Transport.Test.$class"
        })
        if ($passed.Count -eq 0 -or ($class -eq 'UnixPipeContractTests' -and $passed.Count -ne 2)) {
            throw "Missing executed Linux contract coverage: $class"
        }
    }
    if ([int]$counters.failed -ne 0 -or [int]$counters.passed -lt 44 -or
        [int]$counters.total -ne [int]$counters.passed + $unsupported.Count) {
        throw 'Transport TRX counters do not prove the complete Linux contract suite passed'
    }
    $report.tests = @{ total = [int]$counters.total; passed = [int]$counters.passed
        failed = [int]$counters.failed; unsupported = $unsupported; windowsSidAclCovered = $false }
    Write-Host "Actual Linux Transport results: total=$($counters.total), passed=$($counters.passed), failed=$($counters.failed), Windows-only unsupported=$($unsupported.Count)"

    $report.phase = 'netstandard-consumer'
    $consumer = 'QuickerRpc/tests/QuickerRpc.Transport.NetStandardSmoke/QuickerRpc.Transport.NetStandardSmoke.csproj'
    $hook = Join-Path $repoRoot 'QuickerRpc/tests/QuickerRpc.Transport.NetStandardSmoke/NetStandardTransport.targets'
    # Only this consumer invocation narrows Transport's restore/build graph.
    # SetTargetFramework alone does not select the NuGet dependency target.
    Invoke-DotNet -Arguments (@('build', $consumer,
        "-p:CustomAfterMicrosoftCommonTargets=$hook", "-p:CustomAfterMicrosoftCommonCrossTargetingTargets=$hook") + $common)
    $output = @(& dotnet run --project $consumer -c Release --no-build --no-restore)
    if ($LASTEXITCODE -ne 0) { throw "Netstandard consumer failed with exit code $LASTEXITCODE" }
    $output | ForEach-Object { Write-Host $_ }
    $line = @($output | Where-Object { $_ -like '{*' })
    if ($line.Count -ne 1) { throw 'Consumer did not emit exactly one JSON receipt' }
    $smoke = $line[0] | ConvertFrom-Json
    if ($smoke.format -ne 'quicker-rpc-netstandard-consumer' -or $smoke.ok -ne $true -or
        $smoke.os -ne 'linux' -or $smoke.transportTargetFramework -ne '.NETStandard,Version=v2.0' -or
        $smoke.binding.verified -ne $true -or $smoke.ping -ne 'pong' -or $smoke.writes -ne 0) {
        throw 'Consumer receipt did not prove actual Linux netstandard client binding and Ping'
    }
    $report.consumer = $smoke
    $report.phase = 'complete'; $report.ok = $true
}
catch {
    $report.error = $_.Exception.Message
    throw
}
finally {
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $run 'receipt.json') -Encoding utf8
    Write-Host "Linux Transport receipt: $run/receipt.json"
    Pop-Location
}
