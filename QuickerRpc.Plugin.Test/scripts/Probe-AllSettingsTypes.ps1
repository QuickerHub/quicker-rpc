$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')

Write-Host '=== Types matching Setting/Preference/Config (public) ==='
foreach ($t in $asm.GetTypes()) {
    if ($t.FullName -match 'Setting|Preference|Config' -and $t.IsPublic) {
        Write-Host $t.FullName
    }
}

Write-Host ''
Write-Host '=== AppState static properties (all) ==='
$appState = $asm.GetType('Quicker.Domain.AppState')
$appState.GetProperties([Reflection.BindingFlags]'Public,Static') |
    Sort-Object Name |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }

Write-Host ''
Write-Host '=== UserPreference all properties ==='
$pref = $asm.GetType('Quicker.Domain.Entities.UserPreference')
$pref.GetProperties([Reflection.BindingFlags]'Public,Instance') |
    Sort-Object Name |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }

Write-Host ''
Write-Host '=== ExeSettings all properties ==='
$exeSettings = $asm.GetType('Quicker.Domain.Entities.ExeSettings')
$exeSettings.GetProperties([Reflection.BindingFlags]'Public,Instance') |
    Sort-Object Name |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }

Write-Host ''
Write-Host '=== Search types with SettingId or SettingsKey ==='
foreach ($t in $asm.GetTypes()) {
    $props = $t.GetProperties([Reflection.BindingFlags]'Public,Instance,Static')
    foreach ($p in $props) {
        if ($p.Name -match 'SettingId|SettingsKey|ConfigKey|PreferenceKey') {
            Write-Host "$($t.FullName).$($p.Name): $($p.PropertyType.Name)"
        }
    }
}
