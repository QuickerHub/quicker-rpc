$d = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe').GetType('Quicker.View.X.ActionDesignerWindow')
$f = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance -bor [Reflection.BindingFlags]::DeclaredOnly
Write-Host "ToolContent field:" ($null -ne $d.GetField('ToolContent', $f))
Write-Host "ToolTab field:" ($null -ne $d.GetField('ToolTab', $f))
$d.GetFields($f) | Where-Object { $_.Name -match 'Tool' } | ForEach-Object { "$($_.Name) : $($_.FieldType.Name)" }
