$d = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe').GetType('Quicker.View.X.ActionDesignerWindow')
$f = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance
$toolContentField = $d.GetField('ToolContent', $f)
$toolTabField = $d.GetField('ToolTab', $f)
Write-Host "ToolContent field type:" $toolContentField.FieldType.FullName
Write-Host "ToolTab field type:" $toolTabField.FieldType.FullName

# Find SelectionChanged handlers on TabControl - check methods on designer that mention ToolTab
$d.GetMethods($f) | Where-Object { $_.Name -match 'Tool' } | ForEach-Object { $_.Name }
