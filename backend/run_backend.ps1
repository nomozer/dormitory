$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Split-Path -Parent $scriptDir)

$runtimeTmp = Join-Path $scriptDir "runtime\tmp"
if (!(Test-Path -LiteralPath $runtimeTmp)) {
    New-Item -ItemType Directory -Path $runtimeTmp -Force | Out-Null
}

$env:TEMP = $runtimeTmp
$env:TMP = $runtimeTmp

$pythonExe = ".\backend\.venv\Scripts\python.exe"
if (!(Test-Path -LiteralPath $pythonExe)) {
    $pythonExe = ".\.venv\Scripts\python.exe"
}
if (!(Test-Path -LiteralPath $pythonExe)) {
    $pythonExe = "python"
}

& $pythonExe .\backend\server.py
