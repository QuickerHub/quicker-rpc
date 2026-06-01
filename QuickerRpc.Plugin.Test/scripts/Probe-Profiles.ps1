$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
# Find types with Profiles in name
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.Name -match 'ProfileSwitcher|ProfileManager|PanelState|ProfilesDict') {
        Write-Host $t.FullName
    }
}

# AppServer private fields - look for profile manager
$appServer = $asm.GetType('Quicker.Domain.AppServer')
$nf = [Reflection.BindingFlags]'NonPublic,Instance'
Write-Host ''
Write-Host '=== AppServer fields ==='
$appServer.GetFields($nf) | Sort-Object Name | ForEach-Object {
    Write-Host "$($_.Name) : $($_.FieldType.Name)"
}

# ExeSettings
$exeSettings = $asm.GetType('Quicker.Domain.Entities.ExeSettings')
if ($exeSettings) {
    Write-Host ''
    Write-Host '=== ExeSettings properties ==='
    $exeSettings.GetProperties([Reflection.BindingFlags]'Public,Instance') |
        Sort-Object Name |
        ForEach-Object { Write-Host "$($_.Name) : $($_.PropertyType.Name)" }
}

# UserPreference for grid size
$pref = $asm.GetType('Quicker.Domain.Entities.UserPreference')
if ($pref) {
    Write-Host ''
    Write-Host '=== UserPreference (grid/button) ==='
    $pref.GetProperties([Reflection.BindingFlags]'Public,Instance') |
        Where-Object { $_.Name -match 'Row|Col|Button|Grid|Page' } |
        ForEach-Object { Write-Host "$($_.Name) : $($_.PropertyType.Name)" }
}
