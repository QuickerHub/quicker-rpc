$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$common = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.Common.dll')
$pm = $asm.GetType('Quicker.Domain.Profiles.ProfileManager')
$ap = $common.GetType('Quicker.Common.ActionProfile')

Write-Host '=== ProfileManager order-related methods ==='
$pm.GetMethods([Reflection.BindingFlags]'Public,Instance') |
    Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Order|Sort|Move|Global|Profile|Reorder|Insert' } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name + ' ' + $_.Name }) -join ', '
        Write-Host "$($_.Name)($params)"
    }

Write-Host ''
Write-Host '=== ActionProfile order-related properties ==='
$ap.GetProperties([Reflection.BindingFlags]'Public,Instance') |
    Where-Object { $_.Name -match 'Order|List|Index|Sort|Display|Name|Type' } |
    ForEach-Object { Write-Host "$($_.Name) : $($_.PropertyType.Name)" }

Write-Host ''
Write-Host '=== ExeSettings ==='
$exeSettings = $asm.GetType('Quicker.Domain.Entities.ExeSettings')
if ($exeSettings) {
    $exeSettings.GetProperties([Reflection.BindingFlags]'Public,Instance') |
        Sort-Object Name |
        ForEach-Object { Write-Host "$($_.Name) : $($_.PropertyType.Name)" }
}

Write-Host ''
Write-Host '=== PanelState ==='
$panel = $asm.GetType('Quicker.Domain.Profiles.PanelState')
if ($panel) {
    $panel.GetMethods([Reflection.BindingFlags]'Public,Instance') |
        Where-Object { -not $_.IsSpecialName -and $_.Name -match 'Profile|Order|Global|Page' } |
        Sort-Object Name |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "$($_.Name)($params)"
        }
}
