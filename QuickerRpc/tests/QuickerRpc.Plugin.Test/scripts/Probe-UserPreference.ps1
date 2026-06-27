$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$pref = $asm.GetType('Quicker.Domain.Entities.UserPreference')
Write-Host '=== UserPreference all properties ==='
$pref.GetProperties([Reflection.BindingFlags]'Public,Instance') |
    Sort-Object Name |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }

$settings = $asm.GetType('Quicker.Common.Entities.UserSettings')
Write-Host ''
Write-Host '=== UserSettings (Row/Col/Count) ==='
$settings.GetProperties([Reflection.BindingFlags]'Public,Instance') |
    Where-Object { $_.Name -match 'Row|Col|Count|Size|Button|Grid|Page|Panel' } |
    Sort-Object Name |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }
