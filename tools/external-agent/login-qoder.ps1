$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$localCli = Join-Path $root '.runtime\qoder-cli\node_modules\@qodercn-ai\qoderclicn\bundle\qoderclicn.js'
if (Test-Path -LiteralPath $localCli) { & node $localCli login; exit $LASTEXITCODE }
$cli = Get-Command qodercn,qoder,qoderclicn,qodercli -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$cli) { throw 'Install Qoder CLI / Qoder CN CLI first, then run its login command.' }
& $cli.Source login
exit $LASTEXITCODE
