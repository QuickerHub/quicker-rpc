#Requires -Version 7.0
<#
.SYNOPSIS
  Classify compile_ok cases by embedded vs external (@@/%%) subprogram references.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-SubprogramRefs.ps1
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-SubprogramRefs.ps1 -Json
#>
param(
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$externalWrapper = 0
$embedded = 0
$mixed = 0
$noSubprogram = 0
$externalSamples = [System.Collections.Generic.List[string]]::new()

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -notin @('compile_ok', 'mock_pass', 'mock_fail')) {
        continue
    }

    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) {
        continue
    }

    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    $keys = @($lc.supportedStepKeys | ForEach-Object { $_.ToLowerInvariant() })
    if ($keys -notcontains 'sys:subprogram') {
        $noSubprogram++
        continue
    }

    if (Test-CompileVerifyExternalSubProgramWrapper -CaseDir $dir.FullName) {
        $externalWrapper++
        if ($externalSamples.Count -lt 5) {
            $externalSamples.Add($dir.Name)
        }
        continue
    }

    $programJson = Get-CompileVerifyCaseProgramJson -CaseDir $dir.FullName
    if ([string]::IsNullOrWhiteSpace($programJson)) {
        $mixed++
        continue
    }

    if ($programJson -match '"subPrograms"\s*:\s*\[') {
        $embedded++
    }
    else {
        $mixed++
    }
}

$summary = [ordered]@{
    ok                = $true
    externalWrapper   = $externalWrapper
    embedded          = $embedded
    mixed             = $mixed
    noSubprogram      = $noSubprogram
    externalSamples   = @($externalSamples)
    mockProfile       = 'subprogram-external-stub'
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 4
}
else {
    Write-Host "Analyze-SubprogramRefs: externalWrapper=$externalWrapper embedded=$embedded mixed=$mixed noSubprogram=$noSubprogram"
    foreach ($id in $externalSamples) {
        Write-Host "  external sample: $id"
    }
}
