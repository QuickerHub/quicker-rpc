$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')

Write-Host '=== Quicker.Settings types ==='
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.FullName -like 'Quicker.Settings*') {
        Write-Host $t.FullName
    }
}

$targets = @(
    'Quicker.Settings.Pages.Basic.AppSettings',
    'Quicker.Settings.Pages.UISettingsPage',
    'Quicker.Settings.Pages.Basic.SearchSettingsPage',
    'Quicker.Settings.Pages.Tools.AdvancedSettingsPage',
    'Quicker.Settings.Pages.Tools.PowerKeysSettingsPage'
)

foreach ($typeName in $targets) {
    $t = $asm.GetType($typeName)
    if (-not $t) { Write-Host "NOT FOUND: $typeName"; continue }
    Write-Host ''
    Write-Host "=== $typeName ==="
    $t.GetProperties([Reflection.BindingFlags]'Public,Instance,Static') |
        Sort-Object Name |
        ForEach-Object { Write-Host "  [prop] $($_.Name): $($_.PropertyType.Name)" }
    $t.GetFields([Reflection.BindingFlags]'Public,Instance,Static') |
        Sort-Object Name |
        ForEach-Object { Write-Host "  [field] $($_.Name): $($_.FieldType.Name)" }
    $t.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
        Where-Object { -not $_.IsSpecialName } |
        Sort-Object Name |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "  $($_.Name)($params)"
        }
}

Write-Host ''
Write-Host '=== Search SettingKey / ConfigKey / SettingId in Quicker.Settings namespace ==='
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.FullName -notlike 'Quicker.Settings*' -and $t.FullName -notlike 'Quicker.View*') { continue }
    foreach ($p in $t.GetProperties([Reflection.BindingFlags]'Public,Instance,Static')) {
        if ($p.Name -match 'Key|Id|Name|Path|Binding') {
            # skip noisy WPF props
            if ($p.Name -match '^(Name|Tag|Uid|Style|Template)$') { continue }
        }
    }
    foreach ($f in $t.GetFields([Reflection.BindingFlags]'Public,Static')) {
        if ($f.Name -match 'Setting|Config|Key') {
            Write-Host "$($t.FullName).$($f.Name) = $($f.GetValue($null))"
        }
    }
}
