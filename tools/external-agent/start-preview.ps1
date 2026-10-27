param([switch]$NoOpen, [ValidateSet('Codex','OpenCode','Qoder')][string]$Agent)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$dir = Join-Path $root '.runtime\external-agent-preview'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$stateFile = Join-Path $dir 'state.json'
$reuse = $false
if (Test-Path -LiteralPath $stateFile) {
    $s = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($s.pid)"
    $reuse = $s.ready -and $p -and $p.CommandLine.Contains((Join-Path $root 'tools\external-agent\preview.mjs'))
}
if ($reuse -and $Agent) { & (Join-Path $PSScriptRoot 'stop-preview.ps1'); $reuse = $false }
if (!$reuse) {
    @{ready=$false} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
    $node = (Get-Command node.exe).Source
    $arguments = @(('"' + (Join-Path $PSScriptRoot 'preview.mjs') + '"'))
    if ($Agent) { $arguments += @('--agent', $Agent.ToLowerInvariant()) }
    Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dir 'launcher.log') -RedirectStandardError (Join-Path $dir 'launcher-error.log') | Out-Null
    $ready = $false
    for ($i = 0; $i -lt 120; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-Path -LiteralPath $stateFile) { $s = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json; if ($s.ready) { $ready = $true; break } }
    }
    if (!$ready) { throw "Trial failed to start. Logs: $dir" }
}
if (!$NoOpen) { Start-Process 'http://127.0.0.1:18991/' }
