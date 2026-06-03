$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$rds = $asm.GetType('Quicker.Domain.Services.Data.RuntimeDataStore')
Write-Host "RuntimeDataStore props:"
$rds.GetProperties([Reflection.BindingFlags]'Public,Instance,Static') | ForEach-Object { Write-Host "  $($_.Name): $($_.PropertyType.Name)" }
Write-Host ''
$dictProp = $rds.GetProperty('ExeSettingsDict')
Write-Host "ExeSettingsDict: $($dictProp.PropertyType.FullName)"
$appState = $asm.GetType('Quicker.Domain.AppState')
Write-Host ''
Write-Host 'AppState props for Data/Runtime:'
$appState.GetProperties([Reflection.BindingFlags]'Public,Static') | Where-Object { $_.Name -match 'Data|Runtime|Store' } | ForEach-Object { Write-Host "  $($_.Name): $($_.PropertyType.Name)" }
