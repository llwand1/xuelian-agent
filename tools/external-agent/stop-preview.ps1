$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$file = Join-Path $root '.runtime\external-agent-preview\state.json'
if (!(Test-Path -LiteralPath $file)) { exit 0 }
$s = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
if (([IO.Path]::GetFullPath([string]$s.root)).TrimEnd([IO.Path]::DirectorySeparatorChar) -ne $root.TrimEnd([IO.Path]::DirectorySeparatorChar)) { throw 'Trial path mismatch; no process stopped.' }
$backendFile = Join-Path $HOME '.studentbuddy\opencode-chat-bridge\backend-state.json'
if (Test-Path -LiteralPath $backendFile) {
    $b = Get-Content -LiteralPath $backendFile -Raw | ConvertFrom-Json
    $owner = @($s.children | Where-Object { $_.pid -eq $b.parentPid -and ($_.args -join ' ').Contains('studentbuddy-opencode-bridge.mjs') })
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($b.pid)"
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($b.parentPid)"
    if ($owner.Count -eq 1 -and $p -and $parent -and $parent.Name -eq 'node.exe' -and $parent.CommandLine.Contains($root) -and $parent.CommandLine.Contains('studentbuddy-opencode-bridge.mjs') -and $p.ParentProcessId -eq $b.parentPid -and $p.ExecutablePath -eq $b.executable -and $p.CommandLine.Contains('--pure') -and $p.CommandLine.Contains("--port $($b.port)")) { Stop-Process -Id $p.ProcessId }
}
foreach ($child in $s.children) {
    if (($child.args -join ' ').Contains('studentbuddy-qoder-bridge.mjs')) {
        $registry = Join-Path $HOME '.studentbuddy\qoder-chat-bridge\child-processes.json'
        if (Test-Path -LiteralPath $registry) {
            $q = Get-Content -LiteralPath $registry -Raw | ConvertFrom-Json
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($child.pid)"
            if ($q.bridgePid -eq $child.pid -and $owner -and $owner.Name -eq 'node.exe' -and $owner.CommandLine.Contains($root) -and $owner.CommandLine.Contains('studentbuddy-qoder-bridge.mjs')) {
                foreach ($native in $q.children) {
                    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($native.pid)"
                    $matches = $p -and $p.ParentProcessId -eq $child.pid -and $p.ExecutablePath -eq $native.executable
                    foreach ($entry in $native.entryArgs) { if (!$p -or !$p.CommandLine.Contains($entry)) { $matches = $false } }
                    if ($matches) { Stop-Process -Id $p.ProcessId }
                }
            }
        }
    }
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($child.pid)"
    if ($p -and $p.Name -eq 'node.exe' -and $p.CommandLine.Contains($root)) { Stop-Process -Id $p.ProcessId }
}
$p = Get-CimInstance Win32_Process -Filter "ProcessId=$($s.pid)"
if ($p -and $p.Name -eq 'node.exe' -and $p.CommandLine.Contains((Join-Path $root 'tools\external-agent\preview.mjs'))) { Stop-Process -Id $p.ProcessId }
$s.ready = $false
$s | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $file -Encoding utf8
