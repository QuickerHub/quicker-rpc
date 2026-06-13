$exe = 'C:\Program Files\Quicker\Quicker.exe'
$flags = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance -bor [Reflection.BindingFlags]::DeclaredOnly

$asm = [Reflection.Assembly]::LoadFrom($exe)
$designer = $asm.GetType('Quicker.View.X.ActionDesignerWindow')

$voidNoArgs = @(
    $designer.GetMethods($flags) |
        Where-Object { -not $_.IsStatic -and $_.ReturnType -eq [void] -and $_.GetParameters().Length -eq 0 } |
        Sort-Object MetadataToken
)

Write-Host "Release void() count=$($voidNoArgs.Count)"
for ($i = 0; $i -lt $voidNoArgs.Count; $i++) {
    $x = $voidNoArgs[$i]
    $mark = if ($i -eq 10) { ' <-- index 10 (UpdateXActionUi on Debug)' } else { '' }
    Write-Host "[$i] token=$($x.MetadataToken) $($x.Name)$mark"
}

$idx10 = $voidNoArgs[10]
Write-Host ""
Write-Host "Index 10 method: $($idx10.Name) token=$($idx10.MetadataToken)"
