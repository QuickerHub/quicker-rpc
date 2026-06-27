$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')

# Find UserSettings type
$userSettingsTypes = @()
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.Name -eq 'UserSettings') {
        $userSettingsTypes += $t
        Write-Host "Found: $($t.FullName)"
    }
}

foreach ($t in $userSettingsTypes) {
    Write-Host ''
    Write-Host "=== $($t.FullName) properties ==="
    $t.GetProperties([Reflection.BindingFlags]'Public,Instance') |
        Sort-Object Name |
        ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }
}

Write-Host ''
Write-Host '=== RuntimeDataStore save/load methods ==='
$rds = $asm.GetType('Quicker.Domain.Services.Data.RuntimeDataStore')
$rds.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Save|Load|Store|Settings|Preference|Persist' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '=== DataService save/load methods ==='
$ds = $asm.GetType('Quicker.Domain.Services.DataService')
$ds.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Save|Load|Store|Settings|Preference|Persist|User' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '=== AppServer save/load settings methods ==='
$appServer = $asm.GetType('Quicker.Domain.AppServer')
$appServer.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Save|Load|Store|Settings|Preference|Persist|User' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '=== Search exported types with ConfigItem or SettingDef ==='
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.Name -match 'ConfigItem|SettingDef|SettingEntry|PreferenceItem|SettingsPage|AppSetting') {
        Write-Host $t.FullName
    }
}
