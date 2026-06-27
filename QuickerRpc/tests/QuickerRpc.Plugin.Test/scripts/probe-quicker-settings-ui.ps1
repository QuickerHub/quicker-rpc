# Probe Quicker settings UI metadata from Quicker.exe (read-only reflection).
$ErrorActionPreference = 'Stop'
$QuickerExe = 'C:\Program Files\Quicker\Quicker.exe'
if (-not (Test-Path -LiteralPath $QuickerExe)) {
    Write-Error "Quicker.exe not found: $QuickerExe"
}

$asm = [Reflection.Assembly]::LoadFrom($QuickerExe)

$pageInfoType = $asm.GetType('Quicker.Settings.Code.SettingPageInfo')
Write-Output '=== SettingPageInfo properties ==='
$pageInfoType.GetProperties([Reflection.BindingFlags]'Public,Instance') |
    ForEach-Object { Write-Output $_.Name }

$smp = $asm.GetType('Quicker.Settings.SettingsMenuProvider')
$inst = $smp.GetFields([Reflection.BindingFlags]'Static,NonPublic') |
    Where-Object { $_.FieldType -eq $smp } |
    Select-Object -First 1
$provider = $inst.GetValue($null)
$pages = @($smp.GetProperty('AllPages').GetValue($provider))

Write-Output '=== Sample page (CircleMenuSettingPage) ==='
$sample = $pages | Where-Object { $_.Id.ToString() -eq 'CircleMenuSettingPage' } | Select-Object -First 1
foreach ($prop in $pageInfoType.GetProperties([Reflection.BindingFlags]'Public,Instance')) {
    $value = $prop.GetValue($sample)
    if ($null -ne $value -and "$value".Length -gt 0) {
        Write-Output ("{0}={1}" -f $prop.Name, $value)
    }
}
