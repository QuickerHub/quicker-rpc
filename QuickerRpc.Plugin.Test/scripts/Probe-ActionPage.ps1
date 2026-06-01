$ErrorActionPreference = 'Stop'
$asm = [Reflection.Assembly]::LoadFrom('C:\Program Files\Quicker\Quicker.exe')
$types = $asm.GetTypes() | Where-Object {
    $_.FullName -match 'ActionPage|VirtualProcess|VirtualProfile|ProfileStore|ProfileRuntime|ActionProfile'
}
$types | Sort-Object FullName | ForEach-Object { Write-Host $_.FullName }

Write-Host ''
Write-Host '--- ActionPageRuntimeQueryService ---'
$t = $asm.GetType('Quicker.Domain.Services.Actions.ActionPageRuntimeQueryService')
if ($t) {
    $f = [Reflection.BindingFlags]'Public,Instance'
    $t.GetMethods($f) | Sort-Object Name | ForEach-Object {
        $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
        Write-Host "$($_.Name)($params) -> $($_.ReturnType.Name)"
    }
}

Write-Host ''
Write-Host '--- search Create* on all ActionPage types ---'
$asm.GetTypes() | Where-Object { $_.FullName -match 'ActionPage' } | ForEach-Object {
    $type = $_
    $type.GetMethods([Reflection.BindingFlags]'Public,Instance,Static') |
        Where-Object { $_.Name -match 'Create|Add|New|Virtual' } |
        ForEach-Object {
            $params = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ', '
            Write-Host "$($type.Name).$($_.Name)($params)"
        }
}
