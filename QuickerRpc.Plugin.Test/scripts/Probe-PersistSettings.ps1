$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')

Write-Host '=== All DataService methods (name contains Save/Store/Write/Persist/Settings/User) ==='
$ds = $asm.GetType('Quicker.Domain.Services.DataService')
$ds.GetMethods([Reflection.BindingFlags]'Public,Instance,Static,DeclaredOnly') |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Save|Store|Write|Persist|Settings|User|Preference|Runtime' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '=== RuntimeDataStore methods ==='
$rds = $asm.GetType('Quicker.Domain.Services.Data.RuntimeDataStore')
$rds.GetMethods([Reflection.BindingFlags]'Public,Instance,Static,DeclaredOnly') |
    Where-Object { -not $_.IsSpecialName } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '=== Search types with SaveUser or StoreUser in any method ==='
foreach ($t in $asm.GetExportedTypes()) {
    $matches = $t.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
        Where-Object { -not $_.IsSpecialName -and $_.Name -match 'UserSettings|UserPreference|SaveAll|SaveConfig|SaveGlobal' }
    if ($matches) {
        Write-Host $t.FullName
        foreach ($m in $matches) {
            $params = ($m.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "  $($m.Name)($params)"
        }
    }
}

Write-Host ''
Write-Host '=== SettingPage SaveData return type ==='
$sp = $asm.GetType('Quicker.Settings.Pages.SettingPage')
$save = $sp.GetMethod('SaveData')
Write-Host "SaveData -> $($save.ReturnType.FullName)"

Write-Host ''
Write-Host '=== SettingsMenuProvider static/instance fields ==='
$smp = $asm.GetType('Quicker.Settings.SettingsMenuProvider')
$smp.GetFields([Reflection.BindingFlags]'Public,Static,Instance,NonPublic') |
    ForEach-Object { Write-Host "$($_.Name): $($_.FieldType.Name) [$($_.IsStatic)]" }
