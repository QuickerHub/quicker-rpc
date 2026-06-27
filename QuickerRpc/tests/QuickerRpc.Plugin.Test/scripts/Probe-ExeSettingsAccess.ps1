$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
foreach ($typeName in @(
    'Quicker.Domain.AppState',
    'Quicker.Domain.Profiles.ProfileManager',
    'Quicker.Domain.AppServer'
)) {
    $t = $asm.GetType($typeName)
    Write-Host "=== $typeName ==="
    $t.GetMethods([Reflection.BindingFlags]'Public,Static,Instance') |
        Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Exe|Settings|ProfileList|Global' } |
        Sort-Object Name |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "  $($_.Name)($params)"
        }
    $t.GetProperties([Reflection.BindingFlags]'Public,Static,Instance') |
        Where-Object { $_.Name -match 'Exe|Settings|Profile|Switcher' } |
        ForEach-Object { Write-Host "  [prop] $($_.Name): $($_.PropertyType.Name)" }
    Write-Host ''
}
