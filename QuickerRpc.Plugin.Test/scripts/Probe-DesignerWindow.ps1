$exe = 'C:\Program Files\Quicker\Quicker.exe'
$asm = [Reflection.Assembly]::LoadFrom($exe)
$designer = $asm.GetType('Quicker.View.X.ActionDesignerWindow')
if (-not $designer) {
    Write-Host 'ActionDesignerWindow: MISSING'
    exit 1
}
Write-Host "Designer:" $designer.FullName
foreach ($name in @('Action', 'EditingActionItem', 'EditingActionItem2', 'ResultActionItem2', 'IsSubProgram')) {
    $p = $designer.GetProperty($name, [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance)
    Write-Host "  Property $name :" $(if ($p) { $p.PropertyType.Name } else { '(missing)' })
}
foreach ($name in @('UpdateXActionUi', 'SaveAllData', 'SaveMainDialogAsync')) {
    $m = $designer.GetMethod($name, [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance)
    Write-Host "  Method $name :" $(if ($m) { 'yes' } else { '(missing)' })
}
