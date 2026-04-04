param(
    [string]$VenvPath = "backend\.venv"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

$runtimeTmp = Join-Path $scriptDir "runtime\tmp"
if (!(Test-Path -LiteralPath $runtimeTmp)) {
    New-Item -ItemType Directory -Path $runtimeTmp -Force | Out-Null
}

$env:TEMP = $runtimeTmp
$env:TMP = $runtimeTmp

if (Test-Path -LiteralPath $VenvPath) {
    Write-Output "venv-exists: $VenvPath"
} else {
    # --without-pip to avoid ensurepip permission issues on locked hosts.
    python -m venv --without-pip $VenvPath
    if ($LASTEXITCODE -ne 0) {
        throw "Failed creating venv at $VenvPath"
    }
    Write-Output "venv-created: $VenvPath (without pip)"
}

$pythonExe = Join-Path $VenvPath "Scripts\python.exe"
if (!(Test-Path -LiteralPath $pythonExe)) {
    throw "Python executable not found in $VenvPath"
}

& $pythonExe --version
