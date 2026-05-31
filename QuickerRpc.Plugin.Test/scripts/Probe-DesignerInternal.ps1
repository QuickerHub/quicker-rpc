$d = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe').GetType('Quicker.View.X.ActionDesignerWindow')
$f = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance
foreach ($n in @('UpdateXActionUi', 'SaveAllData', 'SaveMainDialogAsync', 'DoSaveWithoutClose')) {
    $m = $d.GetMethod($n, $f)
    if ($m) {
        Write-Host "$n : found ($($m.Attributes))"
    } else {
        Write-Host "$n : missing"
    }
}
