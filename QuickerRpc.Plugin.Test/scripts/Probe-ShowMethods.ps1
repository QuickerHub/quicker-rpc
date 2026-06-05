$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$appServer = $asm.GetType('Quicker.Domain.AppServer')
foreach ($name in @('ShowConfigWindow','ShowSearchWindow','ShowDashboardWindow','ShowExeSettingsWindow')) {
    $m = $appServer.GetMethod($name)
    Write-Host "=== $name ==="
    $m.GetParameters() | ForEach-Object { Write-Host "  $($_.ParameterType.Name) $($_.Name)" }
}

Write-Host ''
Write-Host '=== All SettingPageId ==='
$spi = $asm.GetType('Quicker.Settings.Code.SettingPageId')
[Enum]::GetNames($spi) | ForEach-Object { Write-Host $_ }
