$d = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe').GetType('Quicker.View.X.ActionDesignerWindow')
$f = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance
$tb = $d.GetProperty('TheToolbox', $f)
Write-Host "TheToolbox property:" $tb.PropertyType.FullName
$itb = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe').GetType('Quicker.View.X.IToolBoxControl')
Write-Host "IToolBoxControl:" $itb.FullName
$d.GetFields($f) | Where-Object { $_.FieldType.FullName -eq $itb.FullName } | ForEach-Object { "field $($_.Name) : $($_.FieldType.Name)" }
