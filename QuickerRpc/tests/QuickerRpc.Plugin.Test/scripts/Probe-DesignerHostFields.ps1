$d = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe').GetType('Quicker.View.X.ActionDesignerWindow')
$f = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance
foreach ($n in @('ActionToolboxHost', 'InternalSubProgramListControl', 'GlobalSubProgramsList')) {
    $fld = $d.GetField($n, $f)
    if ($fld) { Write-Host "$n : $($fld.FieldType.Name)" } else { Write-Host "$n : missing" }
}
