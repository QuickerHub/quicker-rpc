$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$ds = $asm.GetType('Quicker.Domain.Services.DataService')
$m = $ds.GetMethod('CWT6OM3GuSH', [Reflection.BindingFlags]'NonPublic,Instance')
Write-Host "Method: $($m.ReturnType.Name) CWT6OM3GuSH($($m.GetParameters() | ForEach-Object { $_.ParameterType.Name }))"
$body = $m.GetMethodBody().GetILAsByteArray()
$i = 0
while ($i -lt $body.Length) {
    $op = $body[$i]
    if (($op -eq 0x28 -or $op -eq 0x6F -or $op -eq 0x73 -or $op -eq 0x7B -or $op -eq 0x7E) -and ($i + 4) -lt $body.Length) {
        $tok = [BitConverter]::ToInt32($body, $i + 1)
        try {
            if ($op -eq 0x7B -or $op -eq 0x7E) {
                $member = $asm.ManifestModule.ResolveField($tok)
                Write-Host ("{0:X4} ldfld {1}.{2}" -f $i, $member.DeclaringType.Name, $member.Name)
            } else {
                $member = $asm.ManifestModule.ResolveMethod($tok)
                Write-Host ("{0:X4} {1} {2}.{3}" -f $i, $(if($op-eq0x73){'newobj'}elseif($op-eq0x28){'call'}else{'callvirt'}), $member.DeclaringType.Name, $member.Name)
            }
        } catch {}
        $i += 5
        continue
    }
    if ($op -eq 0x72 -and ($i + 4) -lt $body.Length) {
        $tok = [BitConverter]::ToInt32($body, $i + 1)
        try {
            $str = $asm.ManifestModule.ResolveString($tok)
            Write-Host ("{0:X4} ldstr '{1}'" -f $i, $str)
        } catch {}
        $i += 5
        continue
    }
    $i++
}
