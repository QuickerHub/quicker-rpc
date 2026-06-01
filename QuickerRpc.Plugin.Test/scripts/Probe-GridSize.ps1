$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$appHelper = $asm.GetType('Quicker.Utilities.AppHelper')
$sf = [Reflection.BindingFlags]'Public,Static'
$m = $appHelper.GetMethod('ForEachButton', $sf, $null, @([bool], [bool], [int], [Action[int]]), $null)
Write-Host "ForEachButton params:"
$m.GetParameters() | ForEach-Object { Write-Host "  $($_.Name): $($_.ParameterType.FullName)" }

# SkinInfo
$skin = $asm.GetType('Quicker.Domain.Skining.SkinInfo')
if ($skin) {
    Write-Host ''
    Write-Host '=== SkinInfo ==='
    $skin.GetProperties([Reflection.BindingFlags]'Public,Instance') |
        Where-Object { $_.Name -match 'Row|Col|Button|Grid|Count' } |
        ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }
}

# UserSettings type on AppState
$settings = $asm.GetType('Quicker.Common.Entities.UserSettings')
if ($settings) {
    Write-Host ''
    Write-Host '=== UserSettings grid ==='
    $settings.GetProperties([Reflection.BindingFlags]'Public,Instance') |
        Where-Object { $_.Name -match 'Row|Col|ButtonCount|Grid|PageSize|PanelSize|ContextButton' } |
        ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }
}

# ProfileManager CreateProfile - check if sets IsVirtual
$pm = $asm.GetType('Quicker.Domain.Profiles.ProfileManager')
$create = $pm.GetMethod('CreateProfile')
Write-Host ''
Write-Host "CreateProfile found on ProfileManager"

# Search methods with Virtual in ProfileManager
$pm.GetMethods([Reflection.BindingFlags]'Public,Instance') |
    Where-Object { $_.Name -match 'Virtual' } |
    ForEach-Object { Write-Host $_.Name }
