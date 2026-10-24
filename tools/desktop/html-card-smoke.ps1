param([Parameter(Mandatory=$true)][string]$Launcher,[Parameter(Mandatory=$true)][string]$Url,[Parameter(Mandatory=$true)][string]$Evidence)
$ErrorActionPreference='Stop'
$Launcher=(Resolve-Path -LiteralPath $Launcher).Path
$Evidence=[IO.Path]::GetFullPath($Evidence)
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null
foreach($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')) {
    Copy-Item -LiteralPath (Join-Path (Split-Path $Launcher) $name) -Destination $Evidence
}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$target=Join-Path $Evidence 'HtmlCardSmoke.exe'
& $compiler /nologo /target:exe /platform:x64 /codepage:65001 /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll "/r:$Evidence\Microsoft.Web.WebView2.Core.dll" "/r:$Evidence\Microsoft.Web.WebView2.WinForms.dll" "/out:$target" (Join-Path $PSScriptRoot 'HtmlCardSmoke.cs')
if($LASTEXITCODE -ne 0){throw 'Native HTML fixture compilation failed'}
$out=Join-Path $Evidence 'stdout.log'; $err=Join-Path $Evidence 'stderr.log'
$process=Start-Process -FilePath $target -ArgumentList @(('"'+$Launcher+'"'),('"'+$Url+'"'),('"'+$Evidence+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$null=$process.Handle
if(!$process.WaitForExit(60000)){$process.Kill();throw 'Native HTML fixture timeout'}
$process.WaitForExit()
Get-Content -LiteralPath $out; Get-Content -LiteralPath $err
if($process.ExitCode -ne 0){throw 'Native HTML sandbox verification failed'}
