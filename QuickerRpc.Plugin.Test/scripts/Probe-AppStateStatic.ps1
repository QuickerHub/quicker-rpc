$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$appState = $asm.GetType('Quicker.Domain.AppState')
$appState.GetProperties([Reflection.BindingFlags]'Public,Static') | Sort-Object Name | ForEach-Object {
    Write-Host "$($_.Name): $($_.PropertyType.Name)"
}
