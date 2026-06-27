$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
foreach ($t in $asm.GetExportedTypes()) {
    foreach ($m in $t.GetMethods([Reflection.BindingFlags]'Public,Instance,Static')) {
        if ($m.Name -match 'ExeSettings|ProfileList') {
            Write-Host "$($t.FullName).$($m.Name)"
        }
    }
    foreach ($p in $t.GetProperties([Reflection.BindingFlags]'Public,Instance,Static')) {
        if ($p.Name -match 'ExeSettings|ProfileList') {
            Write-Host "$($t.FullName).[$($p.Name)]"
        }
    }
}
