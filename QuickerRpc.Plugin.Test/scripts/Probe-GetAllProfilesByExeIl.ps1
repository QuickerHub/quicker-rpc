$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
function Get-IlCalls($method) {
    if ($null -eq $method) { return @() }
    $il = $method.GetMethodBody().GetILAsByteArray()
    $calls = [System.Collections.Generic.List[string]]::new()
    for ($i = 0; $i -lt $il.Length; $i++) {
        if ($il[$i] -eq 0x28 -or $il[$i] -eq 0x6F) {
            $token = [BitConverter]::ToInt32($il, $i + 1)
            try {
                $member = $method.Module.ResolveMethod($token)
                $calls.Add("$($member.DeclaringType.Name).$($member.Name)")
            }
            catch { }
            $i += 4
        }
    }
    return $calls | Select-Object -Unique
}

$pm = $asm.GetType('Quicker.Domain.Profiles.ProfileManager')
$methods = $pm.GetMethods([Reflection.BindingFlags]'Public,Instance') | Where-Object { $_.Name -eq 'GetAllProfilesByExe' }
foreach ($m in $methods) {
    Write-Host "GetAllProfilesByExe($($m.GetParameters().Count) params)"
    Get-IlCalls($m) | ForEach-Object { Write-Host "  $_" }
}

Write-Host ''
$switcher = $asm.GetType('Quicker.Domain.Profiles.ProfileSwitcher')
$dQk = $switcher.GetMethods([Reflection.BindingFlags]'NonPublic,Instance') | Where-Object { $_.Name -eq 'dQk6abHRYHm' }
Write-Host 'dQk6abHRYHm calls:'
Get-IlCalls($dQk) | ForEach-Object { Write-Host "  $_" }
