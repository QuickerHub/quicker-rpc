$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$appState = $asm.GetType('Quicker.Domain.AppState')
$sf = [Reflection.BindingFlags]'Public,Static'
Write-Host '=== AppState static properties ==='
$appState.GetProperties($sf) | Sort-Object Name | ForEach-Object {
    Write-Host "$($_.Name) : $($_.PropertyType.FullName)"
}
Write-Host ''
Write-Host '=== AppState static methods (GetService, etc) ==='
$appState.GetMethods($sf) |
    Where-Object { -not $_.IsSpecialName } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

$data = $appState.GetProperty('DataService', $sf)
if ($data) {
    Write-Host ''
    Write-Host '=== DataService methods (Create/Virtual/Page/Profile) ==='
    $dsType = $data.PropertyType
    Write-Host "DataService type: $($dsType.FullName)"
    $f = [Reflection.BindingFlags]'Public,Instance'
    $dsType.GetMethods($f) |
        Where-Object { $_.Name -match 'Create|Add|New|Virtual|Page|Profile|Save|Get.*Profile|Find.*Slot|Empty' } |
        Sort-Object Name |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "  $($_.Name)($params) -> $($_.ReturnType.Name)"
        }
    $dsType.GetProperties($f) |
        Where-Object { $_.Name -match 'Profile|Page|Virtual' } |
        ForEach-Object { Write-Host "  [prop] $($_.Name) : $($_.PropertyType.Name)" }
}
