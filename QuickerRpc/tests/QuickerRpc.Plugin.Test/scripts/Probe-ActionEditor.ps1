$d = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe').GetType('Quicker.View.X.ActionDesignerWindow')
$f = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance
foreach ($name in @('ActionEditor', 'VariableList')) {
    $p = $d.GetProperty($name, $f)
    if ($p) { Write-Host "Property $name : $($p.PropertyType.FullName)" }
}
$aeField = $d.GetField('ActionEditor', $f)
if ($aeField) {
    $t = $aeField.FieldType
    Write-Host "Field ActionEditor:" $t.FullName
    $m = $t.GetMethod('ReloadStepsAndVariableBindings', $f)
    Write-Host "  ReloadStepsAndVariableBindings:" $(if ($m) { 'yes' } else { 'no' })
}
