$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$switcher = $asm.GetType('Quicker.Domain.Profiles.ProfileSwitcher')
Write-Host "ProfileSwitcher: $($switcher.FullName)"
$switcher.GetMethods([Reflection.BindingFlags]'Public,Instance,Static,NonPublic') |
    Where-Object { -not $_.IsSpecialName } |
    Sort-Object Name |
    ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params)"
    }

Write-Host ''
Write-Host '=== ProfileManager.CreateProfile IL ==='
$pm = $asm.GetType('Quicker.Domain.Profiles.ProfileManager')
$create = $pm.GetMethod('CreateProfile')
$il = $create.GetMethodBody().GetILAsByteArray()
$calls = [System.Collections.Generic.List[string]]::new()
for ($i = 0; $i -lt $il.Length; $i++) {
    if ($il[$i] -eq 0x28 -or $il[$i] -eq 0x6F) {
        $token = [BitConverter]::ToInt32($il, $i + 1)
        try {
            $member = $create.Module.ResolveMethod($token)
            $calls.Add("$($member.DeclaringType.Name).$($member.Name)")
        }
        catch { }
        $i += 4
    }
}
$calls | Select-Object -Unique
