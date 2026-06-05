$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')

# UserSettings via RuntimeDataStore property type
$rds = $asm.GetType('Quicker.Domain.Services.Data.RuntimeDataStore')
$usProp = $rds.GetProperty('UserSettings')
$usType = $usProp.PropertyType
Write-Host "UserSettings type: $($usType.FullName)"
$usType.GetProperties([Reflection.BindingFlags]'Public,Instance') |
    Sort-Object Name |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }

Write-Host ''
Write-Host '=== UserPreference via AppState ==='
$appState = $asm.GetType('Quicker.Domain.AppState')
$upProp = $appState.GetProperty('UserPreference')
Write-Host "UserPreference type: $($upProp.PropertyType.FullName)"

Write-Host ''
Write-Host '=== ExeSettings properties ==='
$es = $asm.GetType('Quicker.Domain.Entities.ExeSettings')
$es.GetProperties([Reflection.BindingFlags]'Public,Instance') |
    Sort-Object Name |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }

Write-Host ''
Write-Host '=== Search const string fields in Quicker.Settings (first 80) ==='
$count = 0
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.FullName -notlike 'Quicker.Settings*') { continue }
    foreach ($f in $t.GetFields([Reflection.BindingFlags]'Public,Static,Literal,FlattenHierarchy')) {
        if ($f.FieldType -eq [string] -and $f.IsLiteral) {
            Write-Host "$($t.Name).$($f.Name) = $($f.GetValue($null))"
            $count++
            if ($count -ge 80) { break }
        }
    }
    if ($count -ge 80) { break }
}
