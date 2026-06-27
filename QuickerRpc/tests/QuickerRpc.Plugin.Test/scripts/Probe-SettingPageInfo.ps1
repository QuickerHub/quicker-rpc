$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')

foreach ($typeName in @(
    'Quicker.Settings.Code.SettingPageInfo',
    'Quicker.Settings.Code.SettingMenuItem',
    'Quicker.Settings.Code.SettingMenuCategory',
    'Quicker.Settings.Code.SettingMenuCategoryInfo',
    'Quicker.Settings.Pages.SettingPage',
    'Quicker.Settings.SettingsMenuProvider',
    'Quicker.Settings.SettingPageSearcherControl'
)) {
    $t = $asm.GetType($typeName)
    if (-not $t) { Write-Host "NOT FOUND: $typeName"; continue }
    Write-Host ''
    Write-Host "=== $typeName ==="
    $t.GetProperties([Reflection.BindingFlags]'Public,Instance,Static') |
        Where-Object { $_.Name -notmatch '^(Actual|Desired|Render|IsMouse|IsStylus|IsKeyboard|IsArrange|IsMeasure|IsLoaded|IsFocused|IsEnabled|IsVisible|IsHitTest|IsTabStop|IsInputMethod|IsManipulation|AreAny|Touches|Parent|Templated|Dependency|Dispatcher|Persist|Bitmap|Clip|Cache|Effect|Flow|Focus|Font|Force|HasAnimated|HasContent|Horizontal|Vertical|Input|Command|Binding|Background|Border|Foreground|Margin|Padding|Opacity|Resources|Style|Template|ToolTip|Triggers|Uid|UseLayout|Snaps|Overrides|Language|Layout|Max|Min|Width|Height|Cursor|ContextMenu|ContentTemplate|ContentString|TabIndex|Tag|Name)$' } |
        Sort-Object Name |
        ForEach-Object { Write-Host "  [prop] $($_.Name): $($_.PropertyType.Name)" }
    $t.GetFields([Reflection.BindingFlags]'Public,Instance,Static') |
        Sort-Object Name |
        ForEach-Object { Write-Host "  [field] $($_.Name): $($_.FieldType.Name)" }
    $t.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
        Where-Object { -not $_.IsSpecialName -and $_.DeclaringType -eq $t } |
        Sort-Object Name |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "  $($_.Name)($params) -> $($_.ReturnType.Name)"
        }
}

Write-Host ''
Write-Host '=== BooleanSettingControl ==='
$bsc = $asm.GetType('Quicker.Settings.Controls.BooleanSettingControl')
$bsc.GetProperties([Reflection.BindingFlags]'Public,Instance,Static') |
    Where-Object { $_.Name -match 'Setting|Key|Path|Bind|Value|Title|Desc|Id' } |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }

Write-Host ''
Write-Host '=== SettingDetailScreenControl ==='
$sdc = $asm.GetType('Quicker.Settings.Controls.SettingDetailScreenControl')
$sdc.GetProperties([Reflection.BindingFlags]'Public,Instance,Static') |
    Where-Object { $_.Name -match 'Setting|Key|Path|Bind|Value|Title|Desc|Id|Page' } |
    ForEach-Object { Write-Host "$($_.Name): $($_.PropertyType.Name)" }
