$exe = 'C:\Program Files\Quicker\Quicker.exe'
$flags = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Instance
$staticFlags = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Static

$asm = [Reflection.Assembly]::LoadFrom($exe)
$designer = $asm.GetType('Quicker.View.X.ActionDesignerWindow')
$hostIface = $asm.GetType('Quicker.View.X.ViewModels.IActionDesignerHostContext')

Write-Host "=== Types ==="
Write-Host "Designer:" $(if ($designer) { $designer.FullName } else { 'MISSING' })
Write-Host "IActionDesignerHostContext:" $(if ($hostIface) { $hostIface.FullName } else { 'MISSING' })

if ($designer -and $hostIface) {
    $implements = $hostIface.IsAssignableFrom($designer)
    Write-Host "Designer implements host context:" $implements
    Write-Host "Designer interfaces:"
    foreach ($i in $designer.GetInterfaces()) {
        if ($i.FullName -like '*ActionDesigner*' -or $i.Name -like '*Host*') {
            Write-Host "  $($i.FullName)"
        }
    }
}

Write-Host ""
Write-Host "=== IActionDesignerHostContext methods (GetMethod on interface) ==="
if (-not $hostIface) {
    Write-Host "  (interface type not visible from external assembly — skip)"
}
else {
    foreach ($name in @(
        'SaveActionStateSnapshot',
        'ReplaceActionContent',
        'RefreshActionUiFromModel',
        'SaveAllDesignerData',
        'InvalidateDesignerCommandRequery'
    )) {
    $m = $hostIface.GetMethod($name, $flags)
    if ($m) {
        $params = ($m.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "  $name($params) -> $($m.ReturnType.Name) [declaring: $($m.DeclaringType.FullName)]"
    }
    else {
        Write-Host "  $name : MISSING on interface"
    }
    }
}

Write-Host ""
Write-Host "=== ActionDesignerWindow direct GetMethod (import flow names) ==="
foreach ($name in @('UpdateXActionUi', 'SaveAllData', 'DoSaveActionState', 'RestoreState')) {
    $m = $designer.GetMethod($name, $flags)
    Write-Host "  $name :" $(if ($m) { "yes ($($m.DeclaringType.Name))" } else { 'MISSING' })
}

Write-Host ""
Write-Host "=== UpdateXActionUi via void()-no-args index (DeclaredOnly, MetadataToken sort) ==="
$voidNoArgs = @(
    $designer.GetMethods($flags -bor [Reflection.BindingFlags]::DeclaredOnly) |
        Where-Object { -not $_.IsStatic -and $_.ReturnType -eq [void] -and $_.GetParameters().Length -eq 0 } |
        Sort-Object MetadataToken
)
Write-Host "  count=$($voidNoArgs.Count) index[10]=$($voidNoArgs[10].Name) anchor[14]=$($voidNoArgs[14].Name)"

Write-Host ""
foreach ($name in @('VariableList', 'SubPrograms')) {
    $p = $designer.GetProperty($name, $flags)
    Write-Host "  Property $name :" $(if ($p) { $p.PropertyType.Name } else { 'MISSING' })
}
foreach ($name in @('ActionStepsWrapper', 'VariableListControl')) {
    $f = $designer.GetField($name, $flags)
    Write-Host "  Field $name :" $(if ($f) { $f.FieldType.Name } else { 'MISSING' })
}
$wrapperType = $asm.GetType('Quicker.View.X.ActionStepsWrapper')
$varCtrlType = $asm.GetType('Quicker.View.X.Controls.VariableListControl')
Write-Host "  ActionStepsWrapper.SetSteps:" $(if ($wrapperType.GetMethod('SetSteps', $flags)) { 'yes' } else { 'MISSING' })
Write-Host "  VariableListControl.SetDataSource:" $(if ($varCtrlType.GetMethod('SetDataSource', $flags)) { 'yes' } else { 'MISSING' })

Write-Host ""
Write-Host "=== RestoreState(ActionStepsDto) signature scan ==="
$dtoType = $asm.GetType('Quicker.Domain.ActionStepsDto')
if ($dtoType) {
    $matches = $designer.GetMethods($flags) | Where-Object {
        -not $_.IsStatic -and $_.ReturnType -eq [void] -and $_.GetParameters().Length -eq 1 -and $_.GetParameters()[0].ParameterType -eq $dtoType
    }
    foreach ($m in $matches) {
        Write-Host "  candidate: $($m.Name) [$($m.DeclaringType.FullName)]"
    }
    if ($matches.Count -eq 0) { Write-Host "  (no matches)" }
}
else {
    Write-Host "  ActionStepsDto type MISSING"
}

Write-Host ""
Write-Host "=== ActionDesignerWindow methods containing Update/Replace/Refresh/SaveState ==="
$designer.GetMethods($flags) |
    Where-Object {
        $_.Name -match 'UpdateXAction|ReplaceAction|RefreshAction|SaveActionState|SaveAllData|RestoreState'
    } |
    ForEach-Object {
        Write-Host "  $($_.Name) declaring=$($_.DeclaringType.FullName)"
    }

Write-Host ""
Write-Host "=== Explicit interface map (ReplaceActionContent) ==="
if ($designer -and $hostIface) {
    try {
        $map = $designer.GetInterfaceMap($hostIface)
        Write-Host "  Interface methods count:" $map.InterfaceMethods.Length
        for ($i = 0; $i -lt $map.InterfaceMethods.Length; $i++) {
            $im = $map.InterfaceMethods[$i]
            $tm = $map.TargetMethods[$i]
            if ($im.Name -match 'Replace|Refresh|SaveAction|SaveAllDesigner|Invalidate') {
                Write-Host "  $($im.Name) -> target $($tm.Name) [$($tm.DeclaringType.FullName)]"
            }
        }
    }
    catch {
        Write-Host "  GetInterfaceMap failed:" $_.Exception.Message
    }
}
