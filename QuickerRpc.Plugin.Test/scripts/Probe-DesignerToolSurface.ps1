$d = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe').GetType('Quicker.View.X.ActionDesignerWindow')
$f = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance -bor [Reflection.BindingFlags]::DeclaredOnly
$d.GetMethods($f) | Where-Object { $_.Name -match 'Tool|Tab|Select|Content|Toolbox' } | Sort-Object Name -Unique | ForEach-Object { $_.Name }

Write-Host '--- fields ---'
$d.GetFields($f) | Sort-Object Name | ForEach-Object { "$($_.Name) : $($_.FieldType.Name)" }
