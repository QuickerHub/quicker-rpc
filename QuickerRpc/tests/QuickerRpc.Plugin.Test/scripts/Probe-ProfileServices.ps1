$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$typeNames = @(
    'Quicker.Domain.Services.DataService',
    'Quicker.Domain.Services.ProfileManager',
    'Quicker.Domain.Services.PanelState',
    'Quicker.Domain.Services.ProfileStore',
    'Quicker.Domain.Services.ActionProfileManager',
    'Quicker.Domain.Services.ProcessProfileManager',
    'Quicker.Domain.Services.VirtualProfileManager',
    'Quicker.Domain.Services.Actions.ActionPageRuntimeQueryService',
    'Quicker.Domain.Services.Actions.ActionPageEditMgr',
    'Quicker.Domain.Services.Actions.ActionPageStore',
    'Quicker.Domain.Services.Actions.ActionPageManager',
    'Quicker.Domain.Services.Actions.ActionPageService',
    'Quicker.Domain.Services.Actions.ActionPageEditService',
    'Quicker.Domain.Services.Actions.VirtualActionPageHelper',
    'Quicker.Domain.Services.Actions.ActionCatalogService',
    'Quicker.Domain.Services.ActionTypeManager',
    'Quicker.Domain.Services.AppServer'
)
$f = [Reflection.BindingFlags]'Public,Instance'
foreach ($name in $typeNames) {
    $t = $asm.GetType($name, $false)
    if (-not $t) { Write-Host "MISSING: $name"; continue }
    Write-Host "=== $name ==="
    $t.GetMethods($f) |
        Where-Object { $_.Name -match 'Create|Add|New|Virtual|Page|Profile|Slot|Button|Empty|Find' } |
        Sort-Object Name |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "  $($_.Name)($params) -> $($_.ReturnType.Name)"
        }
    $t.GetProperties($f) |
        Where-Object { $_.Name -match 'Virtual|Page|Profile' } |
        ForEach-Object { Write-Host "  [prop] $($_.Name) : $($_.PropertyType.Name)" }
    Write-Host ''
}
