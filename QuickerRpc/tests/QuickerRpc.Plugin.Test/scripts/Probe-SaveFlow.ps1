# One-off probe for quicker-exe-type-probing (Release Quicker.exe)
$exe = if ($env:QUICKER_DLL_PATH) { Join-Path $env:QUICKER_DLL_PATH 'Quicker.exe' } else { 'C:\Program Files\Quicker\Quicker.exe' }
$common = Join-Path (Split-Path $exe) 'Quicker.Common.dll'
$asm = [Reflection.Assembly]::LoadFrom($exe)
$commonAsm = [Reflection.Assembly]::LoadFrom($common)

Write-Host "Quicker.exe:" $exe

foreach ($typeName in @(
    'Quicker.Domain.Services.ActionEditorLauncher',
    'Quicker.Domain.Services.ActionEditMgr')) {
    $t = $asm.GetType($typeName)
    if (-not $t) {
        Write-Host "MISSING type:" $typeName
        continue
    }
    $methods = $t.GetMethods([Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance) |
        Where-Object { $_.Name -eq 'SaveEditingAction' }
    foreach ($m in $methods) {
        $ps = ($m.GetParameters() | ForEach-Object { $_.ParameterType.FullName }) -join ', '
        Write-Host "$typeName.SaveEditingAction($ps)"
    }
}

$ai2 = $commonAsm.GetType('Quicker.Common.V2.ActionItem2')
if (-not $ai2) {
    $ai2 = $asm.GetTypes() | Where-Object { $_.Name -eq 'ActionItem2' } | Select-Object -First 1
}
Write-Host "ActionItem2:" $(if ($ai2) { $ai2.FullName } else { 'MISSING' })

$storeType = $asm.GetTypes() | Where-Object { $_.Name -eq 'ActionItem2Store' } | Select-Object -First 1
Write-Host "ActionItem2Store type:" $(if ($storeType) { $storeType.FullName } else { 'MISSING' })

$launcher = $asm.GetTypes() | Where-Object { $_.Name -eq 'ActionEditorLauncher' } | Select-Object -First 1
if ($launcher) {
    $launcher.GetMethods([Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance) |
        Where-Object { $_.Name -eq 'SaveEditingAction' } |
        ForEach-Object {
            $ps = ($_.GetParameters() | ForEach-Object { $_.ParameterType.FullName }) -join ', '
            Write-Host "$($launcher.FullName).SaveEditingAction($ps)"
        }
}

$storeProp = $asm.GetType('Quicker.Domain.AppState').GetProperty('ActionItem2Store')
Write-Host "AppState.ActionItem2Store:" $(if ($storeProp) { 'yes' } else { 'no' })

$designer = $asm.GetType('Quicker.View.X.ActionDesignerWindow')
Write-Host "ActionDesignerWindow:" $(if ($designer) { $designer.FullName } else { 'MISSING' })
