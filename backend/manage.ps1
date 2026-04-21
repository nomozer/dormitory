param(
    [Parameter(Position=0, Mandatory=$true)]
    [ValidateSet("run", "clean", "venv", "pip", "test", "optimize")]
    [string]$Action,
    
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Args
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Get-Item $scriptDir).Parent.FullName
$runtimeTmp = Join-Path $scriptDir "runtime\tmp"

if (!(Test-Path -LiteralPath $runtimeTmp)) {
    New-Item -ItemType Directory -Path $runtimeTmp -Force | Out-Null
}

$env:TEMP = $runtimeTmp
$env:TMP = $runtimeTmp

switch ($Action) {
    "optimize" {
        Set-Location $rootDir
        $pythonExe = ".\backend\.venv\Scripts\python.exe"
        if (!(Test-Path -LiteralPath $pythonExe)) { $pythonExe = ".\.venv\Scripts\python.exe" }
        if (!(Test-Path -LiteralPath $pythonExe)) { $pythonExe = "python" }
        Write-Host "Optimizing database..."
        & $pythonExe .\backend\app\core\db_optimizer.py
    }
    "test" {
        Set-Location $rootDir
        $pythonExe = ".\backend\.venv\Scripts\python.exe"
        if (!(Test-Path -LiteralPath $pythonExe)) { $pythonExe = ".\.venv\Scripts\python.exe" }
        if (!(Test-Path -LiteralPath $pythonExe)) { $pythonExe = "python" }
        Write-Host "Running tests with $pythonExe -m pytest"
        & $pythonExe -m pytest backend\tests
    }
    "run" {
        Set-Location $rootDir
        $pythonExe = ".\backend\.venv\Scripts\python.exe"
        if (!(Test-Path -LiteralPath $pythonExe)) { $pythonExe = ".\.venv\Scripts\python.exe" }
        if (!(Test-Path -LiteralPath $pythonExe)) { $pythonExe = "python" }
        Write-Host "Running backend with $pythonExe"
        & $pythonExe .\backend\app\main.py
    }
    "clean" {
        $ErrorActionPreference = "Continue"
        $logsDir = Join-Path $scriptDir "runtime\logs"
        if (!(Test-Path -LiteralPath $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
        
        Get-ChildItem -LiteralPath $runtimeTmp -Force -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Name -ne ".gitkeep") { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
        }
        Get-ChildItem -LiteralPath $logsDir -Force -ErrorAction SilentlyContinue | Where-Object {
            $_.PSIsContainer -eq $false -and $_.LastWriteTime -lt (Get-Date).AddDays(-14)
        } | ForEach-Object {
            if ($_.Name -ne ".gitkeep") { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
        }
        foreach ($name in @(".tmp_py", ".tmp_pip")) {
            $path = Join-Path $rootDir $name
            if (Test-Path -LiteralPath $path) {
                $ts = Get-Date -Format "yyyyMMdd_HHmmss"
                Move-Item -LiteralPath $path -Destination "$rootDir\${name}_quarantine_$ts" -Force -ErrorAction SilentlyContinue
            }
        }
        Write-Output "Clean completed."
    }
    "venv" {
        Set-Location $rootDir
        $VenvPath = "backend\.venv"
        if (!(Test-Path -LiteralPath $VenvPath)) {
            python -m venv --without-pip $VenvPath
            Write-Output "Created venv without pip at $VenvPath"
        } else {
            Write-Output "Venv already exists."
        }
    }
    "pip" {
        Set-Location $rootDir
        $venvPython = Join-Path $scriptDir ".venv\Scripts\python.exe"
        if (Test-Path -LiteralPath $venvPython) {
            & $venvPython -m pip @Args
        } else {
            Write-Error "Virtual environment not found."
        }
    }
}
