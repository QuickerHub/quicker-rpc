$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$appServer = $asm.GetType('Quicker.Domain.AppServer')
$f = [Reflection.BindingFlags]'Public,Instance'
Write-Host "=== AppServer ==="
$appServer.GetMethods($f) |
    Where-Object { -not $_.IsSpecialName } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

# ActionProfile properties
$profile = $asm.GetType('Quicker.Common.ActionProfile')
Write-Host ''
Write-Host '=== ActionProfile properties ==='
$profile.GetProperties([Reflection.BindingFlags]'Public,Instance') |
    Sort-Object Name |
    ForEach-Object { Write-Host "$($_.Name) : $($_.PropertyType.Name)" }

# Search for types with Virtual in name - use exported types only
Write-Host ''
Write-Host '=== Exported types matching Virtual*Action* or *Virtual*Profile* ==='
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.FullName -match 'Virtual|ActionPage') {
        Write-Host $t.FullName
    }
}
