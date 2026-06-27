$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$names = @(
    'Quicker.Domain.Services.Actions.ActionPageRuntimeQueryService',
    'Quicker.Domain.Services.Actions.ActionPageEditService',
    'Quicker.Domain.Services.Actions.ActionPageService',
    'Quicker.Domain.Services.Actions.ActionPageManager',
    'Quicker.Domain.Services.ProfileManager',
    'Quicker.Domain.Services.ProfileStore',
    'Quicker.Domain.Services.VirtualProcessService',
    'Quicker.Domain.Services.Actions.VirtualProcessService',
    'Quicker.Domain.Services.Actions.VirtualActionPageService',
    'Quicker.Domain.Services.Actions.ActionPageCreateService',
    'Quicker.Domain.Services.ProcessProfileService',
    'Quicker.Domain.Services.ActionProfileManager',
    'Quicker.Domain.AppState'
)
$f = [Reflection.BindingFlags]'Public,Instance'
$sf = [Reflection.BindingFlags]'Public,Static,Instance'

foreach ($name in $names) {
    $t = $asm.GetType($name, $false)
    if (-not $t) { continue }
    Write-Host "=== $name ==="
    $t.GetMethods($f) |
        Where-Object { $_.Name -match 'Create|Add|New|Virtual|Page|Profile|Save|Get' } |
        Sort-Object Name |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "  $($_.Name)($params) -> $($_.ReturnType.Name)"
        }
    Write-Host ''
}

# CreateAction signature detail
$editMgr = $asm.GetType('Quicker.Domain.Services.ActionEditMgr')
$m = $editMgr.GetMethod('CreateAction', $f)
Write-Host '=== CreateAction detail ==='
foreach ($p in $m.GetParameters()) {
    Write-Host "  param: $($p.ParameterType.FullName) $($p.Name)"
}
$nullable = $m.GetParameters()[3].ParameterType
if ($nullable.IsGenericType) {
    Write-Host "  ActionType enum: $($nullable.GetGenericArguments()[0].FullName)"
}

# ActionType values
$at = $asm.GetType('Quicker.Common.ActionType')
if ($at) {
    Write-Host '=== ActionType enum ==='
    [Enum]::GetNames($at) | ForEach-Object { Write-Host "  $_" }
}

# ActionTypeManager.CreateActionItem
$tm = $asm.GetType('Quicker.Domain.Services.ActionTypeManager')
if ($tm) {
    Write-Host '=== ActionTypeManager ==='
    $tm.GetMethods([Reflection.BindingFlags]'Public,Static') | ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "  $($_.Name)($params) -> $($_.ReturnType.Name)"
    }
}
