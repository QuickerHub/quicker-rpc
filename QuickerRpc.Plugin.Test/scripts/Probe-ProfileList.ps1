$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$es = $asm.GetType('Quicker.Domain.Entities.ExeSettings')
$plProp = $es.GetProperty('ProfileList')
$plType = $plProp.PropertyType
Write-Host "ProfileList: $($plType.FullName)"
$elem = $plType.GetGenericArguments()[0]
Write-Host "Element: $($elem.FullName)"
$elem.GetProperties([Reflection.BindingFlags]'Public,Instance') | ForEach-Object {
    Write-Host "  $($_.Name): $($_.PropertyType.Name)"
}

Write-Host ''
Write-Host 'AppServer AddProfile IL calls - search SaveExeSettings'
$appServer = $asm.GetType('Quicker.Domain.AppServer')
$add = $appServer.GetMethod('AddProfile')
$il = $add.GetMethodBody().GetILAsByteArray()
$calls = [System.Collections.Generic.List[string]]::new()
for ($i = 0; $i -lt $il.Length; $i++) {
    if ($il[$i] -eq 0x28 -or $il[$i] -eq 0x6F) {
        $token = [BitConverter]::ToInt32($il, $i + 1)
        try {
            $member = $add.Module.ResolveMethod($token)
            $calls.Add("$($member.DeclaringType.Name).$($member.Name)")
        }
        catch { }
        $i += 4
    }
}
$calls | Select-Object -Unique | Where-Object { $_ -match 'Profile|Exe|Order|List|Save' }
