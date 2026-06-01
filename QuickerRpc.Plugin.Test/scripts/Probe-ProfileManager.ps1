$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$f = [Reflection.BindingFlags]'Public,Instance'
foreach ($typeName in @('Quicker.Domain.Profiles.ProfileManager', 'Quicker.Domain.Profiles.ProfileSwitcher', 'Quicker.Domain.Profiles.PanelState')) {
    $t = $asm.GetType($typeName)
    Write-Host "=== $typeName ==="
    $t.GetMethods($f) |
        Where-Object { -not $_.IsSpecialName } |
        Sort-Object Name |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "  $($_.Name)($params) -> $($_.ReturnType.Name)"
        }
    $t.GetProperties($f) |
        Sort-Object Name |
        ForEach-Object { Write-Host "  [prop] $($_.Name) : $($_.PropertyType.Name)" }
    Write-Host ''
}
