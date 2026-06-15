#Requires -Version 7.0
param(
    [Parameter(Mandatory)]
    [string] $CaseId,

    [Parameter(Mandatory)]
    [string] $ProfileId,

    [switch] $Apply
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$id = $CaseId.Trim().ToLowerInvariant()
$profile = $ProfileId.Trim()
$mapPath = Join-Path $PSScriptRoot 'templates' 'mock-action-profiles.json'
$doc = Get-Content -LiteralPath $mapPath -Raw -Encoding utf8 | ConvertFrom-Json
$exists = $doc.profiles.PSObject.Properties.Name.Contains($id)

if ($Apply) {
    if ($exists) {
        $doc.profiles.$id = $profile
    }
    else {
        $doc.profiles | Add-Member -NotePropertyName $id -NotePropertyValue $profile
    }

    $orderedProfiles = [ordered]@{}
    foreach ($k in ($doc.profiles.PSObject.Properties.Name | Sort-Object)) {
        $orderedProfiles[$k] = [string]$doc.profiles.$k
    }

    $out = [ordered]@{
        version     = [int]($doc.version ?? 1)
        description = [string]$doc.description
        profiles    = $orderedProfiles
    }
    Write-CompileVerifyJsonFile -Path $mapPath -Object $out
}

Write-Host "Add-ManifestCase: caseId=$CaseId profileId=$profile exists=$exists apply=$($Apply.IsPresent)"
