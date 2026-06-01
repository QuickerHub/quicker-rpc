$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$appHelper = $null
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.Name -eq 'AppHelper') { $appHelper = $t; break }
}
if (-not $appHelper) {
    $appHelper = $asm.GetType('Quicker.Utilities.AppHelper')
}
Write-Host "AppHelper: $($appHelper.FullName)"
$sf = [Reflection.BindingFlags]'Public,Static'
$appHelper.GetMethods($sf) |
    Where-Object { $_.Name -match 'Button|Row|Col|Location|Index|Grid' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }
Write-Host ''
Write-Host '=== Const fields ==='
$appHelper.GetFields($sf) |
    Where-Object { $_.Name -match 'ROW|COL|BUTTON|BTN|GRID' } |
    ForEach-Object { Write-Host "$($_.Name) = $($_.GetValue($null))" }

foreach ($t in $asm.GetExportedTypes()) {
    if ($t.Name -match 'ConstValues|Const') {
        $t.GetFields($sf) |
            Where-Object { $_.Name -match 'ROW|COL|BUTTON|BTN|PAGE' } |
            ForEach-Object { Write-Host "$($t.Name).$($_.Name) = $($_.GetValue($null))" }
    }
}
