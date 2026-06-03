$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
function Get-IlCalls($method) {
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
Write-Host 'GetGlobalProfiles calls:'
Get-IlCalls($pm.GetMethod('GetGlobalProfiles')) | ForEach-Object { Write-Host "  $_" }

$load = $asm.GetType('Quicker.Domain.AppServer').GetMethod('LoadExeProfilesAndLock')
Write-Host ''
Write-Host 'LoadExeProfilesAndLock calls:'
Get-IlCalls($load) | Where-Object { $_ -match 'Profile|Exe|List|Order|Global' } | ForEach-Object { Write-Host "  $_" }
