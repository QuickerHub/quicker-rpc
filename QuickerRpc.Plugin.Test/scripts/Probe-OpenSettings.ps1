$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')

Write-Host '=== AppServer settings/window methods ==='
$appServer = $asm.GetType('Quicker.Domain.AppServer')
$appServer.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Settings|Setting|Window|Show|Open|Recycle|Config' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) [$($_.IsStatic)]"
    }

Write-Host ''
Write-Host '=== SettingsWindow2 ==='
$sw = $asm.GetType('Quicker.Settings.SettingsWindow2')
if ($sw) {
    $sw.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
        Where-Object { -not $_.IsSpecialName -and $_.DeclaringType -eq $sw } |
        Sort-Object Name |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "$($_.Name)($params) [$($_.IsStatic)]"
        }
    $sw.GetProperties([Reflection.BindingFlags]'Public,Static,Instance') |
        Where-Object { $_.Name -match 'Instance|Current|Show|Page|Navigate' } |
        ForEach-Object { Write-Host "prop $($_.Name): $($_.PropertyType.Name)" }
    $sw.GetFields([Reflection.BindingFlags]'Public,Static,NonPublic') |
        Where-Object { $_.IsStatic } |
        ForEach-Object { Write-Host "field $($_.Name): $($_.FieldType.Name)" }
}

Write-Host ''
Write-Host '=== AppState settings methods ==='
$appState = $asm.GetType('Quicker.Domain.AppState')
$appState.GetMethods([Reflection.BindingFlags]'Public,Static') |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Settings|Setting|Show|Open|Window|Recycle' } |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params)"
    }

Write-Host ''
Write-Host '=== Search ShowSettings / OpenSettingPage / NavigateTo ==='
foreach ($t in $asm.GetExportedTypes()) {
    foreach ($m in $t.GetMethods([Reflection.BindingFlags]'Public,Static,Instance')) {
        if ($m.IsSpecialName) { continue }
        if ($m.Name -match 'ShowSettings|OpenSettings|OpenSetting|NavigateTo|ShowSettingPage|GotoSetting|SelectSetting') {
            $params = ($m.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "$($t.FullName).$($m.Name)($params)"
        }
    }
}

Write-Host ''
Write-Host '=== SettingPageId values ==='
$spi = $asm.GetType('Quicker.Settings.Code.SettingPageId')
[Enum]::GetNames($spi) | Where-Object { $_ -match 'Recycle|AppSettings|Basic|About' } | ForEach-Object { Write-Host $_ }
