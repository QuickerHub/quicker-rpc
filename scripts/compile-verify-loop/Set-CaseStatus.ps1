#Requires -Version 7.0
<#
.SYNOPSIS
  Manually set a compile-verify case status.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Set-CaseStatus.ps1 -CaseId foo-12345678 -Status skipped
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Set-CaseStatus.ps1 -CaseId foo-12345678 -Status pending
#>
param(
    [Parameter(Mandatory)]
    [string] $CaseId,

    [Parameter(Mandatory)]
    [ValidateSet('pending', 'compile_fail', 'compile_ok', 'mock_fail', 'mock_pass', 'blocked', 'skipped')]
    [string] $Status,

    [string] $Notes = '',

    [switch] $Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$case = Read-CompileVerifyCase -CaseId $CaseId
if ($null -eq $case) {
    throw "Case not found: $CaseId"
}

    $case.status = $Status
    if ($Notes) {
        $case.notes = $Notes
    }
if (Test-CompileVerifySkipStatus -Status $Status) {
    $case.skipUntilEditMs = [long]($case.source.editMs ?? 0)
}
else {
    $case.skipUntilEditMs = 0
}

Write-CompileVerifyCase -Case $case
$manifest = Update-CompileVerifyManifest

$result = [ordered]@{
    ok     = $true
    caseId = $CaseId
    status = $Status
    stats  = $manifest.stats
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Set $CaseId => $Status"
}
