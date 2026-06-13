$exe = 'd:/source/repos/quicker/quickerorg/Quicker/QuickerPc/Quicker/bin/x64/Debug/net472/Quicker.exe'
$flags = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance -bor [Reflection.BindingFlags]::DeclaredOnly

$asm = [Reflection.Assembly]::LoadFrom($exe)
$designer = $asm.GetType('Quicker.View.X.ActionDesignerWindow')
$byName = $designer.GetMethod('UpdateXActionUi', $flags)
Write-Host "UpdateXActionUi by name:" $(if ($byName) { "$($byName.Name) token=$($byName.MetadataToken)" } else { 'MISSING' })

$voidNoArgs = @(
    $designer.GetMethods($flags) |
        Where-Object { -not $_.IsStatic -and $_.ReturnType -eq [void] -and $_.GetParameters().Length -eq 0 } |
        Sort-Object MetadataToken
)

for ($i = 0; $i -lt $voidNoArgs.Count; $i++) {
    $x = $voidNoArgs[$i]
    $mark = if ($byName -and $x.MetadataToken -eq $byName.MetadataToken) { ' <-- UpdateXActionUi' } else { '' }
    Write-Host "[$i] token=$($x.MetadataToken) $($x.Name)$mark"
}

# Also DoSaveActionState
$saveState = $designer.GetMethod('DoSaveActionState', $flags)
Write-Host ""
Write-Host "DoSaveActionState:" $(if ($saveState) { "$($saveState.Name) token=$($saveState.MetadataToken)" } else { 'MISSING' })
