$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')

$sqlType = $asm.GetType('Quicker.Domain.Services.Data.SQLDataMgr')
if (-not $sqlType) {
    foreach ($t in $asm.GetExportedTypes()) {
        if ($t.Name -eq 'SQLDataMgr') { $sqlType = $t; break }
    }
}
Write-Host "SQLDataMgr: $($sqlType.FullName)"
$sqlType.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Save|Store|Write|User|Settings|Preference|Persist|Update' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
$localType = $null
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.Name -eq 'LocalSettings') { $localType = $t; break }
}
if ($localType) {
    Write-Host "=== LocalSettings: $($localType.FullName) ==="
    $localType.GetProperties([Reflection.BindingFlags]'Public,Instance') |
        Sort-Object Name |
        ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }
    $localType.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
        Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Save|Store|Write|Persist' } |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "$($_.Name)($params)"
        }
}

Write-Host ''
Write-Host '=== DataService non-public methods with Save/Settings ==='
$ds = $asm.GetType('Quicker.Domain.Services.DataService')
$ds.GetMethods([Reflection.BindingFlags]'NonPublic,Instance,Public') |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Save|Store|Settings|Preference|User|Persist|Write' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }
