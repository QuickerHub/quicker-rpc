#Requires -Version 7.0
<#
.SYNOPSIS
  Summarize compile_ok cases without mock profiles and probe notify+subprogram candidates.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-CompileOkGaps.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-CompileOkGaps.ps1 -Top 25 -Json
#>
param(
    [int] $Top = 20,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$patternCounts = @{}
$noProfile = 0
$compileOk = 0
$notifySub = @()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') {
        continue
    }

    $compileOk++
    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) {
        continue
    }

    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique)
    $combo = $keys -join '+'

    if (-not (Test-Path -LiteralPath (Join-Path $dir.FullName 'mock-profile.json'))) {
        $noProfile++
        $patternCounts[$combo] = 1 + [int]($patternCounts[$combo] ?? 0)
    }

    if ($combo -eq 'sys:notify+sys:subprogram') {
        $notifySub += [ordered]@{
            caseId  = $dir.Name
            title   = [string]$case.source.title
            runner  = Test-CompileVerifyUsesRunnerHostExpression -CaseDir $dir.FullName
            external = Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $dir.FullName
            embedded = Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $dir.FullName
            wrapper = Test-CompileVerifyExternalSubProgramWrapper -CaseDir $dir.FullName
        }
    }
}

$topPatterns = $patternCounts.GetEnumerator()
    | Sort-Object { $_.Value } -Descending
    | Select-Object -First $Top
    | ForEach-Object { [ordered]@{ combo = $_.Key; count = $_.Value } }

$summary = [ordered]@{
    ok              = $true
    compileOk       = $compileOk
    noMockProfile   = $noProfile
    notifySubprogram = $notifySub
    topPatterns     = @($topPatterns)
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Analyze-CompileOkGaps: compile_ok=$compileOk no_mock_profile=$noProfile"
    Write-Host 'notify+subprogram:'
    foreach ($item in $notifySub) {
        Write-Host "  $($item.caseId) runner=$($item.runner) ext=$($item.external) emb=$($item.embedded) wrap=$($item.wrapper) $($item.title)"
    }
    Write-Host 'Top patterns without mock profile:'
    foreach ($item in $topPatterns) {
        Write-Host "  [$($item.count)] $($item.combo)"
    }
}
