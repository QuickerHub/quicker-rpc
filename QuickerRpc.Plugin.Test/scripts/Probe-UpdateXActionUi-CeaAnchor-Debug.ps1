$exe = 'd:/source/repos/quicker/quickerorg/Quicker/QuickerPc/Quicker/bin/x64/Debug/net472/Quicker.exe'
$flags = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance
$asm = [Reflection.Assembly]::LoadFrom($exe)
$d = $asm.GetType('Quicker.View.X.ActionDesignerWindow')
$names = @($d.GetMethods($flags) | ForEach-Object { $_.Name })
$idx = [Array]::IndexOf($names, 'CheckIfCanSave')
Write-Host "Debug CheckIfCanSave index:" $idx
for ($i = 0; $i -le 8; $i++) { Write-Host "  +$i :" $names[$idx + $i] }
