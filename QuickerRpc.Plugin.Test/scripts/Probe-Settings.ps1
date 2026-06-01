$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$appState = $asm.GetType('Quicker.Domain.AppState')
$appState.GetProperties([Reflection.BindingFlags]'Public,Static') |
    Where-Object { $_.Name -match 'Setting|Preference|Config' } |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }
