$exe = 'C:\Program Files\Quicker\Quicker.exe'
$asm = [Reflection.Assembly]::LoadFrom($exe)
$designer = $asm.GetType('Quicker.View.X.ActionDesignerWindow')
$flags = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance
$designer.GetMethods($flags) |
    Where-Object { $_.Name -match 'Save|Update|XAction|Reload|Load' } |
    Sort-Object Name -Unique |
    ForEach-Object { Write-Host $_.Name }
