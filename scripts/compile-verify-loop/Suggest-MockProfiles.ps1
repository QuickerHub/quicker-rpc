#Requires -Version 7.0
<#
.SYNOPSIS
  Suggest benchmark mock profile ids for compile_ok cases from step patterns.

.EXAMPLE
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Suggest-MockProfiles.ps1 -Apply
  pwsh -NoProfile -File ./scripts/compile-verify-loop/Suggest-MockProfiles.ps1 -Json
#>
param(
    [switch] $Apply,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

function Get-CompileVerifyMockProfileSuggestion {
    param(
        [int] $StepCount,
        [string[]] $SupportedKeys,
        [string] $CaseDir = ''
    )

    $keys = @($SupportedKeys | ForEach-Object { $_.ToLowerInvariant() })
    if ($keys.Count -eq 0) {
        return $null
    }

    if ($keys -contains 'sys:http' -and $keys -contains 'sys:csscript') {
        return $null
    }

    if ($keys -contains 'sys:basic-ocr' -and $keys -contains 'sys:screencapture') {
        return $null
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:csscript' -and $keys -contains 'sys:stop') {
        return $null
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:chromecontrol' -and $keys -contains 'sys:notify') {
        return $null
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:chromecontrol' -and $keys -contains 'sys:if' -and $keys -contains 'sys:subprogram') {
        return $null
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:adobesoftscontrol' -and $keys -contains 'sys:if' -and $keys -contains 'sys:subprogram') {
        return $null
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:if' -and $keys -contains 'sys:notify' -and $keys -contains 'sys:subprogram') {
        return $null
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:outputtext' -and $keys -contains 'sys:subprogram') {
        return $null
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:comment' -and $keys -contains 'sys:notify' -and $keys -contains 'sys:simpleif') {
        return $null
    }

    if ($keys -contains 'sys:getselectedfiles' -and $keys -contains 'sys:runscript') {
        return $null
    }

    if ($StepCount -eq 5 -and $keys -contains 'sys:activateprocessmainwindow' -and $keys -contains 'sys:adobesoftscontrol' -and $keys -contains 'sys:getwindowtitle' -and $keys -contains 'sys:if') {
        return $null
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:select' -and $keys -contains 'sys:sendkeys' -and $keys -contains 'sys:simpleif') {
        return $null
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:whiteboard') {
        return $null
    }

    if ($keys -contains 'sys:screencapture' -and $keys -contains 'sys:subprogram') {
        return $null
    }

    if ($keys -contains 'sys:basic-ocr' -and $keys -contains 'sys:subprogram') {
        return $null
    }

    if ($keys -contains 'sys:http' -and $keys -contains 'sys:subprogram') {
        return $null
    }

    if ($keys -contains 'sys:form' -and $keys -contains 'sys:subprogram' -and $StepCount -gt 3) {
        return $null
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:form' -and $keys -contains 'sys:openurl' -and $keys -contains 'sys:simpleif' -and $keys -contains 'sys:subprogram') {
        return $null
    }

    $runtimeSuccessSingle = @(
        'sys:outputtext',
        'sys:showtext',
        'sys:reportprogress',
        'sys:openurl',
        'sys:delay',
        'sys:comment',
        'sys:assign',
        'sys:compute',
        'sys:evalexpression',
        'sys:newguid',
        'sys:randomnum'
    )

    if ($StepCount -eq 1 -and $keys.Count -eq 1 -and $runtimeSuccessSingle -contains $keys[0]) {
        return 'runtime-success'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:chromecontrol') {
        return 'runtime-success'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:adobesoftscontrol') {
        return 'runtime-success'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:keyinput') {
        return 'runtime-success'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:runscript') {
        return 'runtime-success'
    }

    if ($keys -contains 'sys:csscript' -and $StepCount -gt 1) {
        return $null
    }

    if ($keys -contains 'sys:jsscript' -and $StepCount -gt 2) {
        return $null
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:csscript') {
        return 'runtime-success'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:jsscript') {
        return 'runtime-success'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:run') {
        return 'runtime-success'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:form') {
        return 'runtime-success'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:http') {
        return 'runtime-success'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:sendkeys') {
        return 'runtime-success'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:screencapturepro') {
        return 'runtime-success'
    }

    if ($StepCount -eq 2 -and $keys -contains 'sys:getclipboardimage' -and $keys -contains 'sys:showimage') {
        return $null
    }

    if ($StepCount -eq 2 -and $keys -contains 'sys:getselectedtext' -and $keys -contains 'sys:outputtext' -and -not [string]::IsNullOrWhiteSpace($CaseDir)) {
        $programJson = Get-CompileVerifyCaseProgramJson -CaseDir $CaseDir
        if ($programJson -match 'SplitToList|JoinToString') {
            return $null
        }

        return 'runtime-success'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:subprogram' -and -not [string]::IsNullOrWhiteSpace($CaseDir)) {
        if (Test-CompileVerifyExternalSubProgramWrapper -CaseDir $CaseDir) {
            return 'subprogram-external-stub'
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($CaseDir) -and $keys -contains 'sys:subprogram') {
        if (Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $CaseDir) {
            $companionKeys = @(
                'sys:notify', 'sys:delay', 'sys:comment', 'sys:outputtext', 'sys:assign',
                'sys:stop', 'sys:break', 'sys:continue', 'sys:openurl', 'sys:evalexpression',
                'sys:keyinput', 'sys:chromecontrol', 'sys:writeclipboard', 'sys:simpleif', 'sys:if',
                'sys:getexplorerpath', 'sys:runscript', 'sys:showtext',
                'sys:getwindowtitle', 'sys:sendkeys', 'sys:activateprocessmainwindow', 'sys:run',
                'sys:adobesoftscontrol', 'sys:userinput', 'sys:screencapture',
                'sys:showimage'
            )
            $onlyCompanion = $true
            foreach ($k in $keys) {
                if ($k -eq 'sys:subprogram') {
                    continue
                }

                if ($companionKeys -notcontains $k) {
                    $onlyCompanion = $false
                    break
                }
            }

            if ($onlyCompanion) {
                return 'subprogram-external-stub'
            }
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($CaseDir) -and $keys -contains 'sys:subprogram' -and $keys -contains 'sys:readfile') {
        if (-not (Test-CompileVerifyUsesRunnerHostExpression -CaseDir $CaseDir)) {
            if (Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $CaseDir) {
                if (-not (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $CaseDir)) {
                    return 'subprogram-external-readfile-stub'
                }
            }
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($CaseDir) -and $keys -contains 'sys:subprogram') {
        if (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $CaseDir) {
            if (Test-CompileVerifyMockableOnlyStepKeys -StepKeys ($keys | Where-Object { $_ -ne 'sys:subprogram' })) {
                return 'subprogram-stub-all'
            }
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($CaseDir) -and $keys -notcontains 'sys:subprogram') {
        if (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $CaseDir) {
            if (Test-CompileVerifyMockableOnlyStepKeys -StepKeys $keys) {
                if ($keys -contains 'sys:csscript' -or $keys -contains 'sys:jsscript' -or $keys -contains 'sys:http' -or $keys -contains 'sys:form') {
                    return $null
                }

                return 'subprogram-stub-all'
            }
        }
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:notify') {
        return 'notify-toast-simple'
    }

    if ($StepCount -eq 1 -and $keys -contains 'sys:activateprocessmainwindow') {
        return 'activate-process-simple'
    }

    if ($StepCount -eq 2 -and $keys -contains 'sys:getwindowtitle' -and $keys -contains 'sys:notify') {
        return 'window-title-notify'
    }

    if ($StepCount -eq 2 -and $keys -contains 'sys:keyinput' -and $keys -contains 'sys:outputtext') {
        return 'runtime-success'
    }

    if ($StepCount -eq 2 -and $keys -contains 'sys:chromecontrol' -and $keys -contains 'sys:writeclipboard') {
        return 'runtime-success'
    }

    if ($StepCount -eq 2 -and $keys -contains 'sys:screencapture' -and $keys -contains 'sys:showimage') {
        return 'runtime-success'
    }

    if ($StepCount -eq 2 -and $keys -contains 'sys:adobesoftscontrol') {
        return 'runtime-success'
    }

    if ($StepCount -eq 2 -and $keys -contains 'sys:notify' -and $keys -contains 'sys:subprogram' -and -not [string]::IsNullOrWhiteSpace($CaseDir)) {
        if (-not (Test-CompileVerifyUsesRunnerHostExpression -CaseDir $CaseDir)) {
            if (Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $CaseDir) {
                return 'subprogram-external-stub'
            }

            if (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $CaseDir) {
                return 'subprogram-stub-all'
            }

            return 'subprogram-stub-all'
        }
    }

    if ($StepCount -eq 2 -and $keys -contains 'sys:subprogram' -and ($keys -contains 'sys:showtext' -or $keys -contains 'sys:outputtext') -and -not [string]::IsNullOrWhiteSpace($CaseDir)) {
        if (Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $CaseDir) {
            if (-not (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $CaseDir)) {
                return 'subprogram-external-stub'
            }
        }
    }

    if ($StepCount -in @(3, 4) -and $keys -contains 'sys:subprogram' -and $keys -contains 'sys:outputtext' -and -not [string]::IsNullOrWhiteSpace($CaseDir)) {
        if (Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $CaseDir) {
            if (-not (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $CaseDir)) {
                $externalCompanion = $true
                foreach ($k in $keys) {
                    if ($k -eq 'sys:subprogram' -or $k -eq 'sys:outputtext') { continue }
                    if ($k -eq 'sys:jsscript' -or $k -eq 'sys:getselectedtext' -or $k -eq 'sys:run') { continue }
                    $externalCompanion = $false
                    break
                }

                if ($externalCompanion) {
                    return 'subprogram-external-stub'
                }
            }
        }
    }

    if ($StepCount -eq 5 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:msgbox' -and $keys -contains 'sys:run' -and $keys -contains 'sys:simpleif' -and $keys -contains 'sys:subprogram' -and -not [string]::IsNullOrWhiteSpace($CaseDir)) {
        if (Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $CaseDir) {
            if (-not (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $CaseDir)) {
                return 'subprogram-external-stub'
            }
        }
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:outputtext' -and $keys -contains 'sys:subprogram' -and -not [string]::IsNullOrWhiteSpace($CaseDir)) {
        if (Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $CaseDir) {
            if (-not (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $CaseDir)) {
                return 'subprogram-external-stub'
            }
        }
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:simpleif' -and $keys -contains 'sys:subprogram' -and -not [string]::IsNullOrWhiteSpace($CaseDir)) {
        if (Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $CaseDir) {
            if (-not (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $CaseDir)) {
                return 'subprogram-external-stub'
            }
        }
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:chromecontrol' -and $keys -contains 'sys:getselectedtext' -and $keys -contains 'sys:showtext') {
        return 'runtime-success'
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:getclipboardtext' -and $keys -contains 'sys:strreplace' -and $keys -contains 'sys:writeclipboard') {
        return 'runtime-success'
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:getexplorerpath' -and $keys -contains 'sys:getselectedfiles' -and $keys -contains 'sys:runscript' -and $keys -contains 'sys:simpleif') {
        return 'runtime-success'
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:getactiveprocessinfo' -and $keys -contains 'sys:if' -and $keys -contains 'sys:msgbox' -and $keys -contains 'sys:runscript') {
        return 'runtime-success'
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:activateprocessmainwindow' -and $keys -contains 'sys:chromecontrol' -and $keys -contains 'sys:jsonextract' -and $keys -contains 'sys:writeclipboard') {
        return 'runtime-success'
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:activateprocessmainwindow' -and $keys -contains 'sys:getselectedtext' -and $keys -contains 'sys:keyinput' -and $keys -contains 'sys:outputtext') {
        return 'runtime-success'
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:getselectedtext' -and $keys -contains 'sys:outputtext' -and $keys -contains 'sys:stringprocess') {
        return 'runtime-success'
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:computetime' -and $keys -contains 'sys:getcurrenttime' -and $keys -contains 'sys:outputtext') {
        return 'runtime-success'
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:getclipboardtext' -and $keys -contains 'sys:notify' -and $keys -contains 'sys:stringprocess' -and $keys -contains 'sys:writeclipboard') {
        return 'runtime-success'
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:delay' -and $keys -contains 'sys:each' -and $keys -contains 'sys:openurl' -and $keys -contains 'sys:simpleif') {
        return 'runtime-success'
    }

    if ($StepCount -eq 5 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:notify' -and $keys -contains 'sys:run' -and $keys -contains 'sys:simpleif' -and $keys -contains 'sys:stop') {
        return 'runtime-success'
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:if' -and $keys -contains 'sys:subprogram' -and $keys -contains 'sys:userinput' -and -not [string]::IsNullOrWhiteSpace($CaseDir)) {
        if (Test-CompileVerifyCaseUsesExternalSubProgram -CaseDir $CaseDir) {
            if (-not (Test-CompileVerifyHasEmbeddedSubProgram -CaseDir $CaseDir)) {
                return 'subprogram-external-stub'
            }
        }
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:getactiveprocessinfo' -and $keys -contains 'sys:pathextraction' -and $keys -contains 'sys:run') {
        return 'runtime-success'
    }

    if ($StepCount -eq 3 -and $keys -contains 'sys:delay' -and $keys -contains 'sys:openurl' -and $keys -contains 'sys:userinput') {
        return 'runtime-success'
    }

    if ($StepCount -eq 4 -and $keys -contains 'sys:run' -and $keys -contains 'sys:runscript' -and $keys -contains 'sys:simpleif' -and $keys -contains 'sys:stop') {
        return 'runtime-success'
    }

    if ($StepCount -le 2 -and (Test-CompileVerifyMockableOnlyStepKeys -StepKeys $keys)) {
        if ($keys.Count -eq 2 -and $keys -contains 'sys:assign' -and $keys -contains 'sys:simpleif') {
            return $null
        }

        if ($keys -contains 'sys:subprogram') {
            if (-not [string]::IsNullOrWhiteSpace($CaseDir) -and (Test-CompileVerifyExternalSubProgramOnlyNoEmbedded -CaseDir $CaseDir)) {
                return 'subprogram-external-stub'
            }

            return $null
        }

        return 'runtime-success'
    }

    return $null
}

$manualMap = Get-CompileVerifyBenchmarkMockMap
$profilesDir = Get-CompileVerifyMockProfilesDir
$casesDir = Join-Path (Get-CompileVerifyLoopRoot) 'cases'
$suggestions = @()
$applied = 0

foreach ($dir in @(Get-ChildItem -LiteralPath $casesDir -Directory -ErrorAction SilentlyContinue)) {
    $case = Read-CompileVerifyCase -CaseId $dir.Name
    if ($null -eq $case -or [string]$case.status -ne 'compile_ok') {
        continue
    }

    $actionId = [string]$case.source.actionId
    $key = $actionId.ToLowerInvariant()
    if ($manualMap.ContainsKey($key)) {
        continue
    }

    $lcPath = Join-Path $dir.FullName 'last-compile.json'
    if (-not (Test-Path -LiteralPath $lcPath)) {
        continue
    }

    $lc = Read-CompileVerifyJsonFile -Path $lcPath
    $supported = @($lc.supportedStepKeys)
    $profileId = Get-CompileVerifyMockProfileSuggestion -StepCount ([int]$lc.totalStepCount) -SupportedKeys $supported -CaseDir $dir.FullName
    if ([string]::IsNullOrWhiteSpace($profileId)) {
        continue
    }

    if (Test-CompileVerifyMockProfileRejected -Case $case -ProfileId $profileId) {
        continue
    }

    $src = Join-Path $profilesDir "$profileId.json"
    if ($profileId -ne 'subprogram-external-readfile-stub' -and -not (Test-Path -LiteralPath $src)) {
        continue
    }

    $entry = [ordered]@{
        caseId    = $dir.Name
        actionId  = $actionId
        title     = [string]($lc.actionTitle ?? $case.source.title ?? '')
        profileId = $profileId
        pattern   = ($supported -join ',')
    }
    $suggestions += $entry

    if ($Apply) {
        if ($profileId -eq 'subprogram-external-readfile-stub') {
            Write-CompileVerifyReadFileMockProfile -CaseDir $dir.FullName
        }
        else {
            Copy-Item -LiteralPath $src -Destination (Join-Path $dir.FullName 'mock-profile.json') -Force
        }
        $applied++
    }
}

$mapPath = Join-Path $PSScriptRoot 'templates' 'mock-action-profiles.json'
$mapDoc = Get-Content -LiteralPath $mapPath -Raw -Encoding utf8 | ConvertFrom-Json
$profiles = @{}
foreach ($prop in $mapDoc.profiles.PSObject.Properties) {
    $profiles[$prop.Name.ToLowerInvariant()] = [string]$prop.Value
}

foreach ($item in $suggestions) {
    $profiles[[string]$item.actionId] = [string]$item.profileId
}

if ($Apply) {
    $orderedProfiles = [ordered]@{}
    foreach ($k in ($profiles.Keys | Sort-Object)) {
        $orderedProfiles[$k] = $profiles[$k]
    }

    $out = [ordered]@{
        version     = 1
        description = [string]$mapDoc.description
        profiles    = $orderedProfiles
    }
    Write-CompileVerifyJsonFile -Path $mapPath -Object $out
}

$summary = [ordered]@{
    ok          = $true
    apply       = [bool]$Apply
    suggested   = $suggestions.Count
    applied     = $applied
    suggestions = $suggestions
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Suggest-MockProfiles: suggested=$($suggestions.Count) applied=$applied"
    foreach ($item in $suggestions) {
        Write-Host "  $($item.actionId) ($($item.title)) -> $($item.profileId)"
    }
}
