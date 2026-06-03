$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$ds = $asm.GetType('Quicker.Domain.Services.DataService')
$ds.GetMethods([Reflection.BindingFlags]'Public,Instance') |
    Where-Object { -not $_.IsSpecialName } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name + ' ' + $_.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }
