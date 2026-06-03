$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$t = $asm.GetType('Quicker.View.ProfileManagement.ExeListControl')
$m = $t.GetMethod('Init')
Write-Host "Init: $($m.GetParameters() | ForEach-Object { $_.ParameterType.Name + ' ' + $_.Name })"
$body = $m.GetMethodBody().GetILAsByteArray()
$i = 0
while ($i -lt $body.Length) {
    $op = $body[$i]
    if (($op -eq 0x28 -or $op -eq 0x6F -or $op -eq 0x73) -and ($i + 4) -lt $body.Length) {
        $tok = [BitConverter]::ToInt32($body, $i + 1)
        try {
            $member = $asm.ManifestModule.ResolveMethod($tok)
            Write-Host ("{0:X4} {1} {2}.{3}" -f $i, $(if($op-eq0x73){'newobj'}elseif($op-eq0x28){'call'}else{'callvirt'}), $member.DeclaringType.Name, $member.Name)
        }
        catch {
            try {
                $member = $asm.ManifestModule.ResolveMember($tok)
                Write-Host ("{0:X4} member {1}" -f $i, $member)
            } catch {}
        }
        $i += 5
        continue
    }
    $i++
}

Write-Host ''
Write-Host '=== AppServer.AddProfile IL (first 40 calls) ==='
$add = $asm.GetType('Quicker.Domain.AppServer').GetMethod('AddProfile')
$body2 = $add.GetMethodBody().GetILAsByteArray()
$i = 0; $count = 0
while ($i -lt $body2.Length -and $count -lt 40) {
    $op = $body2[$i]
    if (($op -eq 0x28 -or $op -eq 0x6F) -and ($i + 4) -lt $body2.Length) {
        $tok = [BitConverter]::ToInt32($body2, $i + 1)
        try {
            $member = $asm.ManifestModule.ResolveMethod($tok)
            Write-Host "$($member.DeclaringType.Name).$($member.Name)"
            $count++
        } catch {}
        $i += 5
        continue
    }
    $i++
}
