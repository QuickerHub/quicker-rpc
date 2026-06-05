$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$usType = $asm.GetType('Quicker.Domain.Services.Data.RuntimeDataStore').GetProperty('UserSettings').PropertyType

Write-Host '=== SQLDataMgr ALL methods ==='
$sql = $asm.GetType('Quicker.Domain.Services.SQLDataMgr')
$sql.GetMethods([Reflection.BindingFlags]'Public,Instance,Static,NonPublic') |
    Where-Object { -not $_.IsSpecialName } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) [$($_.IsPublic)]"
    }

Write-Host ''
Write-Host '=== Methods with UserSettings param (exported types) ==='
foreach ($t in $asm.GetExportedTypes()) {
    foreach ($m in $t.GetMethods([Reflection.BindingFlags]'Public,Instance,Static,NonPublic')) {
        if ($m.IsSpecialName) { continue }
        foreach ($p in $m.GetParameters()) {
            if ($p.ParameterType -eq $usType) {
                Write-Host "$($t.FullName).$($m.Name)"
            }
        }
        if ($m.ReturnType -eq $usType) {
            Write-Host "$($t.FullName).$($m.Name) -> UserSettings"
        }
    }
}

Write-Host ''
Write-Host '=== AppState static props/methods for Settings ==='
$appState = $asm.GetType('Quicker.Domain.AppState')
$appState.GetProperties([Reflection.BindingFlags]'Public,Static') |
    ForEach-Object { Write-Host "prop $($_.Name): $($_.PropertyType.Name)" }
$appState.GetMethods([Reflection.BindingFlags]'Public,Static') |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Settings|Preference|Save|User' } |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params)"
    }

Write-Host ''
Write-Host '=== Search UserSettings string in type/method names (exported) ==='
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.Name -match 'UserSettings') { Write-Host $t.FullName }
    foreach ($m in $t.GetMethods([Reflection.BindingFlags]'Public,Instance,Static')) {
        if ($m.Name -match 'UserSettings') {
            Write-Host "$($t.FullName).$($m.Name)"
        }
    }
}
