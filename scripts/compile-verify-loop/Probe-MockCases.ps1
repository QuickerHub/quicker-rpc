#Requires -Version 7.0
<#
.SYNOPSIS
  Apply a mock profile to compile_ok cases and run mock assert (no recompile).

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Probe-MockCases.ps1 -CaseId 664aeb95-0764-48fc-d7d9-08ddef742b9a -RegisterManifest
#>
param(
    [Parameter(Mandatory)]
    [string[]] $CaseId,

    [string] $ProfileId = 'subprogram-external-stub',

    [switch] $RegisterManifest
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$env:QKRPC_EXE = if ($env:QKRPC_EXE) { $env:QKRPC_EXE } else { (Resolve-CompileVerifyQkrpcExe) }
$src = Join-Path (Get-CompileVerifyMockProfilesDir) "$ProfileId.json"
if (-not (Test-Path -LiteralPath $src)) {
    throw "Mock profile not found: $src"
}

$pass = 0
$fail = 0
$results = @()

foreach ($id in $CaseId) {
    $case = Read-CompileVerifyCase -CaseId $id
    if ($null -eq $case) {
        Write-Host "MISSING $id"
        $fail++
        continue
    }

    Write-Host "$id status=$($case.status)"
    if ([string]$case.status -ne 'compile_ok') {
        $fail++
        $results += [ordered]@{ caseId = $id; ok = $false; reason = 'not compile_ok' }
        continue
    }

    $dest = Join-Path (Get-CompileVerifyCasePath -CaseId $id) 'mock-profile.json'
    Copy-Item -LiteralPath $src -Destination $dest -Force
    $r = pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Invoke-Case.ps1') -CaseId $id -MockOnly -Force -Json | ConvertFrom-Json

    if ($r.status -eq 'mock_pass') {
        $pass++
        Write-Host '  OK mock_pass'
        if ($RegisterManifest) {
            pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Add-ManifestCase.ps1') -CaseId $id -ProfileId $ProfileId -Apply | Out-Null
        }

        $results += [ordered]@{ caseId = $id; ok = $true; status = 'mock_pass' }
        continue
    }

    $fail++
    Write-Host "  FAIL $($r.status)"
    pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Repair-MockFailCases.ps1') | Out-Null
    $results += [ordered]@{ caseId = $id; ok = $false; status = [string]$r.status }
}

Update-CompileVerifyManifest | Out-Null
Write-Host "Probe-MockCases: pass=$pass fail=$fail"
if ($fail -gt 0) { exit 1 }
