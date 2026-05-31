$d = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe').GetType('Quicker.View.X.ActionDesignerWindow')
$f = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance
$d.GetMethods($f) | Where-Object { $_.Name -match 'Step|Action|Program|Reload|Refresh|Persist' } | Sort-Object Name -Unique | ForEach-Object { $_.Name }
