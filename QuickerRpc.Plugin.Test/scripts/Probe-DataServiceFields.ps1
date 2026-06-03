$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$dsType = $asm.GetType('Quicker.Domain.Services.DataService')
Write-Host "DataService: $($dsType.FullName)"
Write-Host 'Properties:'
$dsType.GetProperties([Reflection.BindingFlags]'Public,Instance') | Sort-Object Name | ForEach-Object {
    Write-Host "  $($_.Name): $($_.PropertyType.Name)"
}
Write-Host 'Fields (nonpublic):'
$dsType.GetFields([Reflection.BindingFlags]'NonPublic,Instance,Public') | Sort-Object Name | ForEach-Object {
    Write-Host "  $($_.Name): $($_.FieldType.Name)"
}
