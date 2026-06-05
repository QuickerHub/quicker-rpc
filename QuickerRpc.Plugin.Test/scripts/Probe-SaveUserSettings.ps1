$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')

$usType = $asm.GetType('Quicker.Domain.Services.Data.RuntimeDataStore').GetProperty('UserSettings').PropertyType
$globalProp = $usType.GetProperty('GlobalSettings')
Write-Host "GlobalSettings type: $($globalProp.PropertyType.FullName)"
if ($globalProp.PropertyType.IsGenericType) {
    $args = $globalProp.PropertyType.GetGenericArguments()
    Write-Host "  Key: $($args[0].FullName)"
    Write-Host "  Value: $($args[1].FullName)"
}

Write-Host ''
Write-Host '=== Methods on UserSettings type ==='
$usType.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
    Where-Object { -not $_.IsSpecialName } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '=== DataService UserSettings methods ==='
$ds = $asm.GetType('Quicker.Domain.Services.DataService')
$ds.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
    Where-Object { -not $_.IsSpecialName -and ($_.Name -match 'UserSettings|UserPreference|Save|Store|Persist|Settings') } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '=== AppState UserSettings/UserPreference access ==='
$appState = $asm.GetType('Quicker.Domain.AppState')
$appState.GetProperties([Reflection.BindingFlags]'Public,Static') |
    Where-Object { $_.Name -match 'User|Settings|Preference|Runtime|Store' } |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }

Write-Host ''
Write-Host '=== Search SaveUserSettings / StoreUserSettings across exported types ==='
foreach ($t in $asm.GetExportedTypes()) {
    foreach ($m in $t.GetMethods([Reflection.BindingFlags]'Public,Static,Instance')) {
        if ($m.Name -match 'SaveUserSettings|StoreUserSettings|SaveSettings|PersistUserSettings|SavePreference') {
            $params = ($m.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "$($t.FullName).$($m.Name)($params)"
        }
    }
}
