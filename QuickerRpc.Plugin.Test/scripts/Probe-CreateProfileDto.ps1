$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$names = @(
    'Quicker.Domain.CreateProfileDto',
    'Quicker.Common.CreateProfileDto',
    'Quicker.Domain.Dto.CreateProfileDto',
    'Quicker.Domain.Services.CreateProfileDto',
    'Quicker.Domain.Vm.CreateProfileDto'
)
foreach ($name in $names) {
    $t = $asm.GetType($name, $false)
    if ($t) { Write-Host "Found: $name" }
}

# search exported types
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.Name -match 'CreateProfile|ProfileDto|VirtualProfile|ExeSettings') {
        Write-Host $t.FullName
    }
}

$createDto = $null
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.Name -eq 'CreateProfileDto') { $createDto = $t; break }
}
if (-not $createDto) {
    # try get from AddProfile parameter
    $appServer = $asm.GetType('Quicker.Domain.AppServer')
    $addProfile = $appServer.GetMethod('AddProfile')
    $createDto = $addProfile.GetParameters()[0].ParameterType
}
Write-Host ''
Write-Host "CreateProfileDto: $($createDto.FullName)"
$createDto.GetProperties([Reflection.BindingFlags]'Public,Instance') |
    Sort-Object Name |
    ForEach-Object { Write-Host "  $($_.Name) : $($_.PropertyType.Name)" }

Write-Host ''
Write-Host '=== ActionTypeManager (search exported) ==='
foreach ($t in $asm.GetExportedTypes()) {
    if ($t.Name -eq 'ActionTypeManager') {
        Write-Host $t.FullName
        $t.GetMethods([Reflection.BindingFlags]'Public,Static') | ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "  $($_.Name)($params) -> $($_.ReturnType.Name)"
        }
    }
}

Write-Host ''
Write-Host '=== ActionProfile from Quicker.Common ==='
$profileAsm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.Common.dll')
$profile = $profileAsm.GetType('Quicker.Common.ActionProfile')
$profile.GetProperties([Reflection.BindingFlags]'Public,Instance') |
    Sort-Object Name |
    ForEach-Object { Write-Host "  $($_.Name) : $($_.PropertyType.Name)" }
