$exe = 'C:\Program Files\Quicker\Quicker.exe'
$flags = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance

$asm = [Reflection.Assembly]::LoadFrom($exe)
$designer = $asm.GetType('Quicker.View.X.ActionDesignerWindow')

$methods = @($designer.GetMethods($flags) | ForEach-Object { $_.Name })
Write-Host "Total instance methods (GetMethods order):" $methods.Count

$anchorIdx = [Array]::IndexOf($methods, 'CheckIfCanSave')
Write-Host "CheckIfCanSave index:" $anchorIdx

if ($anchorIdx -ge 0) {
    $slice = $methods[$anchorIdx..([Math]::Min($anchorIdx + 12, $methods.Count - 1))]
    for ($i = 0; $i -lt $slice.Count; $i++) {
        $mark = if ($i -eq 6) { ' <-- offset +6 (CeaQuicker UpdateXActionUi)' } else { '' }
        Write-Host "  anchor+$i : $($slice[$i])$mark"
    }
}

Write-Host ""
Write-Host "CheckIfCanSave exists:" ($anchorIdx -ge 0)
Write-Host "UpdateXActionUi by name:" ($methods -contains 'UpdateXActionUi')
