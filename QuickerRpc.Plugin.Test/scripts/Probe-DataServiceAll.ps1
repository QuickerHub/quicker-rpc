$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$ds = $asm.GetType('Quicker.Domain.Services.DataService')
$f = [Reflection.BindingFlags]'Public,Instance'
Write-Host "DataService method count:"
($ds.GetMethods($f) | Where-Object { -not $_.IsSpecialName }).Count
$ds.GetMethods($f) |
    Where-Object { -not $_.IsSpecialName } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '=== SetButtonAction on ActionEditMgr ==='
$editMgr = $asm.GetType('Quicker.Domain.Services.ActionEditMgr')
$editMgr.GetMethods($f) |
    Where-Object { $_.Name -match 'SetButton|Create|Save|Profile|Virtual' } |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.FullName }) -join ', '
        Write-Host "$($_.Name)($params)"
    }
