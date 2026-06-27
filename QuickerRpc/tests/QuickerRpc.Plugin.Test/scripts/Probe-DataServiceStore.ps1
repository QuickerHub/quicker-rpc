$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$ds = $asm.GetType('Quicker.Domain.Services.DataService')
$ds.GetProperties([Reflection.BindingFlags]'Public,Instance,Static') |
    Where-Object { $_.Name -match 'Runtime|Store|Exe|Settings' } |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }
$ds.GetFields([Reflection.BindingFlags]'NonPublic,Instance,Public') |
    Where-Object { $_.Name -match 'Runtime|Store|Exe|Settings|Data' } |
    Select-Object -First 20 |
    ForEach-Object { Write-Host "field $($_.Name): $($_.FieldType.Name)" }
