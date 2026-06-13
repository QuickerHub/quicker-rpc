$flags = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance -bor [Reflection.BindingFlags]::DeclaredOnly

foreach ($label in @('Release', 'Debug')) {
    $exe = if ($label -eq 'Release') {
        'C:\Program Files\Quicker\Quicker.exe'
    }
    else {
        'd:/source/repos/quicker/quickerorg/Quicker/QuickerPc/Quicker/bin/x64/Debug/net472/Quicker.exe'
    }
    if (-not (Test-Path $exe)) {
        Write-Host "$label exe missing: $exe"
        continue
    }

    $asm = [Reflection.Assembly]::LoadFrom($exe)
    $designer = $asm.GetType('Quicker.View.X.ActionDesignerWindow')
    Write-Host "=== $label ==="

    $byName = $designer.GetMethod('UpdateXActionUi', $flags)
    if ($byName) {
        Write-Host "ByName: $($byName.Name) token=$($byName.MetadataToken) handle=$($byName.MethodHandle.Value)"
    }
    else {
        Write-Host 'ByName: MISSING'
    }

    $voidNoArgs = @(
        $designer.GetMethods($flags) |
            Where-Object {
                -not $_.IsStatic -and $_.ReturnType -eq [void] -and $_.GetParameters().Length -eq 0
            } |
            Sort-Object MetadataToken
    )

    Write-Host "void() declared-only count=$($voidNoArgs.Count)"
    for ($i = 0; $i -lt $voidNoArgs.Count; $i++) {
        $x = $voidNoArgs[$i]
        $mark = if ($byName -and $x.MetadataToken -eq $byName.MetadataToken) { ' <-- UpdateXActionUi' } else { '' }
        Write-Host "  [$i] token=$($x.MetadataToken) $($x.Name)$mark"
    }

    # Resolve by metadata token from Debug build (if available)
    if ($label -eq 'Release' -and $byName) {
        Write-Host '(unexpected: Release has name lookup)'
    }
}
