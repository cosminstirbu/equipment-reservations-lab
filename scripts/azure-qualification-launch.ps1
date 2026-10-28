$ErrorActionPreference = 'Stop'
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue
$launchMode = $args[0]
$launchArguments = @($args | Select-Object -Skip 1)
switch ($launchMode) {
    'verify' { & node "$PSScriptRoot/azure-qualification-launch.mjs" verify @launchArguments }
    'prove' { & node "$PSScriptRoot/azure-qualification-launch.mjs" prove @launchArguments }
    'bootstrap' { & node "$PSScriptRoot/azure-qualification-launch.mjs" bootstrap @launchArguments }
    'install' { & npm.cmd ci --ignore-scripts }
    default { Write-Error 'Unsupported qualification launch mode'; exit 1 }
}
exit $LASTEXITCODE
