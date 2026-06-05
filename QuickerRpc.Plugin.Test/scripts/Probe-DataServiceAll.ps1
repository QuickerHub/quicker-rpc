$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$ds = $asm.GetType('Quicker.Domain.Services.DataService')
Write-Host '=== DataService ALL public instance methods ==='
$ds.GetMethods([Reflection.BindingFlags]'Public,Instance') |
    Where-Object { -not $_.IsSpecialName } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '=== DataService fields (non-public) ==='
$ds.GetFields([Reflection.BindingFlags]'NonPublic,Instance,Public') |
    Where-Object { $_.FieldType.Name -match 'Runtime|Store|Settings|Data' } |
    ForEach-Object { Write-Host "$($_.Name): $($_.FieldType.Name)" }

Write-Host ''
Write-Host '=== HubExtension NotifyUserSettingsChange ==='
$hub = $asm.GetType('Quicker.Domain.Messages.HubExtension')
$hub.GetMethods([Reflection.BindingFlags]'Public,Static') |
    Where-Object { $_.Name -match 'UserSettings|Settings|Preference' } |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params)"
    }

Write-Host ''
Write-Host '=== Search Save* methods taking UserSettings ==='
$usType = $asm.GetType('Quicker.Domain.Services.Data.RuntimeDataStore').GetProperty('UserSettings').PropertyType
foreach ($t in $asm.GetExportedTypes()) {
    foreach ($m in $t.GetMethods([Reflection.BindingFlags]'Public,Static,Instance')) {
        if (-not $m.Name.StartsWith('Save')) { continue }
        $ps = $m.GetParameters()
        if ($ps.Length -eq 0) { continue }
        if ($ps[0].ParameterType -eq $usType -or $ps[0].ParameterType.Name -eq 'UserSettings') {
            Write-Host "$($t.FullName).$($m.Name)($($ps[0].ParameterType.Name))"
        }
    }
}
