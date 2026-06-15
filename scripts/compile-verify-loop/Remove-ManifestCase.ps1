#Requires -Version 7.0
param(
    [Parameter(Mandatory)]
    [string] $CaseId,
    [switch] $Apply
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'CompileVerifyLoop.Common.ps1')

$id = $CaseId.Trim().ToLowerInvariant()
$mapPath = Join-Path $PSScriptRoot 'templates' 'mock-action-profiles.json'
$doc = Get-Content -LiteralPath $mapPath -Raw -Encoding utf8 | ConvertFrom-Json
$removed = $false

if ($doc.profiles.PSObject.Properties.Name.Contains($id)) {
    if ($Apply) {
        $doc.profiles.PSObject.Properties.Remove($id)
        $doc | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $mapPath -Encoding utf8
    }

    $removed = $true
}

Write-Host "Remove-ManifestCase: caseId=$CaseId removed=$removed apply=$($Apply.IsPresent)"
