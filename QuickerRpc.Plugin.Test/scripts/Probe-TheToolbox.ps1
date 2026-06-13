$d = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe').GetType('Quicker.View.X.ActionDesignerWindow')
$f = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance
$p = $d.GetProperty('TheToolbox', $f)
Write-Host "TheToolbox:" $p.PropertyType.FullName
$d.GetFields($f) | Where-Object { $_.Name -match 'Toolbox|ToolContent|ActionToolbox' } | ForEach-Object { "$($_.Name) : $($_.FieldType.Name)" }
$d.GetProperties($f) | Where-Object { $_.Name -match 'Tool' } | ForEach-Object { "$($_.Name) : $($_.PropertyType.Name)" }

# TabControl template - check if ContentTemplate uses ToolContent
$tabType = [System.Windows.Controls.TabControl]
Write-Host "TabControl events registered via class handlers - n/a without live window"
