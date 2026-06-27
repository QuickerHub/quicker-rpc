$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$appState = $asm.GetType('Quicker.Domain.AppState')
$sf = [Reflection.BindingFlags]'Public,Static'
$appState.GetMethods($sf) |
    Where-Object { $_.Name -match 'GetService|Service' } |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }

$pm = $asm.GetType('Quicker.Domain.Profiles.ProfileManager')
Write-Host ''
Write-Host "ProfileManager IsPublic: $($pm.IsPublic)"
