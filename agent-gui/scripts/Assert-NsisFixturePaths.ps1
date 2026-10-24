[CmdletBinding()]
param([Parameter(Mandatory)][string]$PathsJson, [switch]$Trees)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/ElectronSmoke.ps1')
$count = 0
foreach ($candidate in ($PathsJson | ConvertFrom-Json)) {
    $absolute = Assert-SmokeLocalPath $candidate
    if (-not $Trees -or -not (Test-Path -LiteralPath $absolute -PathType Container)) { continue }
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($absolute)
    while ($pending.Count -gt 0) {
        $folder = $pending.Pop()
        foreach ($entry in Get-ChildItem -LiteralPath $folder -Force) {
            # Inspect metadata before descending or opening any contents. Never
            # follow a junction or hydrate a cloud/recall placeholder.
            if (([long]$entry.Attributes -band (0x400 -bor 0x1000 -bor 0x40000 -bor 0x400000)) -ne 0) { throw "Unsafe fixture source metadata: $($entry.FullName)" }
            if ($entry.PSIsContainer) {
                if ($entry.Name -match '^(?i:OneDrive.*|Dropbox|iCloud.*)$') { throw 'Cloud fixture source directory' }
                $pending.Push($entry.FullName)
            }
            $count++
        }
    }
}
Write-Output "fixture-metadata-ok:$count"
