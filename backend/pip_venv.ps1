param(
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]]$PipArgs
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

$venvPython = Join-Path $scriptDir ".venv\Scripts\python.exe"
if (!(Test-Path -LiteralPath $venvPython)) {
    throw "Khong tim thay backend\\.venv\\Scripts\\python.exe. Hay tao venv truoc."
}

& $venvPython -m pip @PipArgs
