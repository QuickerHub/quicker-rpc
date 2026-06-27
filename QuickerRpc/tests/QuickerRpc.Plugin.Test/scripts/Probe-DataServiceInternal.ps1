$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$ds = $asm.GetType('Quicker.Domain.Services.DataService')
$ds.GetMethods([Reflection.BindingFlags]'NonPublic,Instance,Public') |
    Where-Object { -not $_.IsSpecialName -and $_.GetParameters().Count -le 2 } |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        if ($_.ReturnType.Name -match 'ExeSettings|Runtime|Profile|Bool|Void' -or $_.Name -match 'Exe|Runtime|Profile|Settings|Store') {
            Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
        }
    }
