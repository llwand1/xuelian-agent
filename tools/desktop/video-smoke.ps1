param([Parameter(Mandatory=$true)][string]$Launcher,[string]$Shot='')
$ErrorActionPreference='Stop'
$Launcher=(Resolve-Path -LiteralPath $Launcher).Path
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dir=Join-Path $repo ('.runtime\video-smoke-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir | Out-Null
foreach($name in @('StudentBuddy.exe','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')){Copy-Item -LiteralPath (Join-Path (Split-Path $Launcher) $name) -Destination $dir}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$target=Join-Path $dir 'VideoFrameSmoke.exe'
& $compiler /nologo /target:exe /platform:x64 /codepage:65001 /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll "/r:$dir\Microsoft.Web.WebView2.Core.dll" "/r:$dir\Microsoft.Web.WebView2.WinForms.dll" "/out:$target" (Join-Path $PSScriptRoot 'VideoFrameSmoke.cs')
if($LASTEXITCODE -ne 0){throw 'Native video fixture compilation failed'}
if($Shot){& $target (Join-Path $dir 'StudentBuddy.exe') ([IO.Path]::GetFullPath($Shot))}else{& $target (Join-Path $dir 'StudentBuddy.exe')}
if($LASTEXITCODE -ne 0){throw 'Native live-video capture verification failed'}
