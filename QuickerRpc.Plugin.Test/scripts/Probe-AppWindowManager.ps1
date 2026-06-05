$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')

$awm = $asm.GetType('Quicker.Domain.Services.AppWindowManager')
Write-Host "AppWindowManager: $($awm.FullName)"
$awm.GetMethods([Reflection.BindingFlags]'Public,Static,Instance') |
    Where-Object { -not $_.IsSpecialName } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ', '
        Write-Host "$($_.Name)($params) [$($_.IsStatic)] -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '=== ShowSettingsWindow param detail ==='
$show = $awm.GetMethod('ShowSettingsWindow', [Reflection.BindingFlags]'Public,Static')
$show.GetParameters() | ForEach-Object { Write-Host "$($_.Name): $($_.ParameterType.FullName)" }

Write-Host ''
Write-Host '=== AppServer ShowConfigWindow ==='
$appServer = $asm.GetType('Quicker.Domain.AppServer')
$cfg = $appServer.GetMethod('ShowConfigWindow')
$cfg.GetParameters() | ForEach-Object { Write-Host "param $($_.Name)" }
Write-Host "return: $($cfg.ReturnType.Name)"

Write-Host ''
Write-Host '=== SettingsWindow2 static access ==='
$sw = $asm.GetType('Quicker.Settings.SettingsWindow2')
$sw.GetFields([Reflection.BindingFlags]'Static,Public,NonPublic') |
    ForEach-Object { Write-Host "field $($_.Name): $($_.FieldType.Name) static=$($_.IsStatic)" }
