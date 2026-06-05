$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')

$sql = $asm.GetType('Quicker.Domain.Services.SQLDataMgr')
$saveCommon = $sql.GetMethod('SaveCommonDataObjectFromLocal', [Reflection.BindingFlags]'NonPublic,Instance')
Write-Host "SaveCommonDataObjectFromLocal params:"
$saveCommon.GetParameters() | ForEach-Object { Write-Host "  $($_.ParameterType.Name) $($_.Name)" }

Write-Host ''
$saveUs = $sql.GetMethods([Reflection.BindingFlags]'NonPublic,Instance') |
    Where-Object { $_.GetParameters().Length -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'UserSettings' }
foreach ($m in $saveUs) { Write-Host "Save UserSettings method: $($m.Name)" }

$savePref = $sql.GetMethods([Reflection.BindingFlags]'NonPublic,Instance') |
    Where-Object { $_.GetParameters().Length -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'UserPreference' }
foreach ($m in $savePref) { Write-Host "Save UserPreference method: $($m.Name)" }

Write-Host ''
Write-Host '=== SettingPage SaveDataFromUi / SaveData ==='
$sp = $asm.GetType('Quicker.Settings.Pages.SettingPage')
$sp.GetMethods([Reflection.BindingFlags]'Public,NonPublic,Instance') |
    Where-Object { $_.Name -match 'SaveData|LoadData|Persist|Notify' } |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) [$($_.IsPublic)]"
    }

Write-Host ''
Write-Host '=== SettingsMenuProvider AllPages / SearchPage ==='
$smp = $asm.GetType('Quicker.Settings.SettingsMenuProvider')
$instField = $smp.GetField('QYdCjWpWmUvbIk5ZoeH5', [Reflection.BindingFlags]'Static,NonPublic,Public')
if ($instField) {
    $inst = $instField.GetValue($null)
    $allPages = $smp.GetProperty('AllPages').GetValue($inst)
    $count = 0
    foreach ($page in $allPages) {
        $count++
        if ($count -le 5) {
            $id = $page.Id
            Write-Host "Page: $($page.Title) id=$id keywords=$($page.KeyWords)"
        }
    }
    Write-Host "Total pages: $count"
}

Write-Host ''
Write-Host '=== SettingPageId enum values ==='
$spi = $asm.GetType('Quicker.Settings.Code.SettingPageId')
if ($spi.IsEnum) {
    [Enum]::GetNames($spi) | ForEach-Object { Write-Host $_ }
}
