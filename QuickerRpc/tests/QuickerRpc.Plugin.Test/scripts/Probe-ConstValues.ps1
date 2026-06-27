$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.Name -eq 'ConstValues') {
        Write-Host $t.FullName
        $sf = [Reflection.BindingFlags]'Public,Static'
        $t.GetFields($sf) |
            Where-Object { $_.Name -match 'BTN|ROW|COL|BUTTON' } |
            ForEach-Object { Write-Host "$($_.Name) = $($_.GetValue($null))" }
    }
}
