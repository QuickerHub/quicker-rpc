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

$switcher = $asm.GetType('Quicker.Domain.Profiles.ProfileSwitcher')
Write-Host '=== LoadGlobalProfiles ==='
Get-IlCalls($switcher.GetMethod('LoadGlobalProfiles')) | ForEach-Object { Write-Host $_ }

Write-Host ''
Write-Host '=== AppServer.AddProfile ==='
$appServer = $asm.GetType('Quicker.Domain.AppServer')
Get-IlCalls($appServer.GetMethod('AddProfile')) | ForEach-Object { Write-Host $_ }

Write-Host ''
Write-Host '=== Search types with ProfileList in name ==='
$asm.GetTypes() | Where-Object { $_.Name -match 'GlobalProfile|ProfileOrder|ProfileSort' } | Select-Object -First 20 FullName
