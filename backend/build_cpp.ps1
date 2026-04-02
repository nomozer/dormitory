param(
    [string]$Compiler = "g++"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $scriptDir "cpp\analytics_engine.cpp"
$binDir = Join-Path $scriptDir "bin"
$output = Join-Path $binDir "analytics_engine.exe"
$runtimeTmp = Join-Path $scriptDir "runtime\tmp"

if (!(Test-Path -LiteralPath $binDir)) {
    New-Item -ItemType Directory -Path $binDir | Out-Null
}
if (!(Test-Path -LiteralPath $runtimeTmp)) {
    New-Item -ItemType Directory -Path $runtimeTmp -Force | Out-Null
}

$env:TEMP = $runtimeTmp
$env:TMP = $runtimeTmp

& $Compiler -O3 -std=c++17 -Wall -Wextra $source -o $output

if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
}

Write-Output "Built: $output"
