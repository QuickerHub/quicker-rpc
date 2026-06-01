$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$t = $asm.GetType('Quicker.Domain.Services.ActionEditMgr')
if (-not $t) {
    Write-Host 'ActionEditMgr not found by name; scanning types...'
    $asm.GetTypes() | Where-Object { $_.Name -match 'ActionEdit|ActionPage|Virtual' } |
        Select-Object -First 30 FullName | ForEach-Object { Write-Host $_.FullName }
    exit 1
}

Write-Host "Type: $($t.FullName)"
$f = [Reflection.BindingFlags]'Public,Instance'
$t.GetMethods($f) |
    Where-Object { $_.Name -match 'Create|Add|New|Virtual|Page|Delete|Edit|Save|Action' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '--- AppState ProfileStore ---'
$appState = $asm.GetType('Quicker.Domain.AppState')
$ps = $appState.GetProperty('ProfileStore', [Reflection.BindingFlags]'Public,Static')
if ($ps) {
    $pst = $ps.PropertyType
    Write-Host "ProfileStore type: $($pst.FullName)"
    $pst.GetMethods($f) |
        Where-Object { $_.Name -match 'Create|Add|New|Virtual|Page|Profile' } |
        Sort-Object Name |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
        }
}
