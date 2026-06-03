$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$f = [Reflection.BindingFlags]'Public,NonPublic,Instance,Static'

# DataService internal methods mentioning exe list
$ds = $asm.GetType('Quicker.Domain.Services.DataService')
Write-Host '=== DataService exe-related methods ==='
$ds.GetMethods($f) |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Exe|Virtual|Profile|Settings|Save|Load|Common' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name + ' ' + $_.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

Write-Host ''
Write-Host '=== RuntimeDataStore properties ==='
$rds = $asm.GetType('Quicker.Domain.Services.Data.RuntimeDataStore')
$rds.GetProperties($f) | Sort-Object Name | ForEach-Object { Write-Host "$($_.Name) : $($_.PropertyType.Name)" }

Write-Host ''
Write-Host '=== UserPreference (Domain.Entities) ==='
$up = $asm.GetType('Quicker.Domain.Entities.UserPreference')
if ($up) {
    $up.GetProperties($f) | Sort-Object Name | ForEach-Object { Write-Host "$($_.Name) : $($_.PropertyType.Name)" }
}

Write-Host ''
Write-Host '=== ExeListControl private fields ==='
$elc = $asm.GetType('Quicker.View.ProfileManagement.ExeListControl')
$elc.GetFields($f) | Where-Object { $_.Name -match 'exe|list|virtual|item' -or $_.FieldType.Name -match 'List|Observable|Collection' } |
    ForEach-Object { Write-Host "$($_.Name) : $($_.FieldType.Name)" }

Write-Host ''
Write-Host '=== NewExeSettingsWindow methods (non-wpf) ==='
$newExe = $asm.GetType('Quicker.View.NewExeSettingsWindow')
$newExe.GetMethods($f) |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Save|Create|Ok|Confirm|Virtual|Exe' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params)"
    }

Write-Host ''
Write-Host '=== SQLDataMgr exe/settings methods ==='
$sql = $asm.GetType('Quicker.Domain.SQL.SQLDataMgr')
$sql.GetMethods($f) |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Exe|Settings|Common|Virtual' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name + ' ' + $_.Name }) -join ', '
        Write-Host "$($_.Name)($params)"
    }
