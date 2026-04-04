param(
    [int]$FrontendPort = 4173,
    [int]$BackendPort = 5050,
    [string]$FrontendHost = "127.0.0.1",
    [string]$BackendHost = "127.0.0.1",
    [switch]$OpenBrowser,
    [switch]$ShowChildWindows
)

$ErrorActionPreference = "Stop"

function Resolve-PythonExe {
    param(
        [string]$RootDir
    )

    $candidates = @(
        (Join-Path $RootDir "backend\.venv\Scripts\python.exe"),
        (Join-Path $RootDir ".venv\Scripts\python.exe"),
        "python"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -eq "python") {
            $cmd = Get-Command python -ErrorAction SilentlyContinue
            if ($cmd) { return "python" }
            continue
        }
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }

    throw "Không tìm thấy Python. Hãy cài Python hoặc tạo backend/.venv trước."
}

function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $null = Invoke-WebRequest -Uri $Url -TimeoutSec 2
            return $true
        } catch {
            Start-Sleep -Milliseconds 350
        }
    }
    return $false
}

function Stop-IfRunning {
    param(
        [System.Diagnostics.Process]$ProcessObject
    )

    if (-not $ProcessObject) { return }
    try {
        if (-not $ProcessObject.HasExited) {
            Stop-Process -Id $ProcessObject.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {
        # Ignore cleanup errors.
    }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$pythonExe = Resolve-PythonExe -RootDir $root
$pwshExe = (Get-Process -Id $PID).Path
$logsDir = Join-Path $root "backend\runtime\logs"
if (!(Test-Path -LiteralPath $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

$backendOutLog = Join-Path $logsDir "dev-backend.out.log"
$backendErrLog = Join-Path $logsDir "dev-backend.err.log"
$frontendOutLog = Join-Path $logsDir "dev-frontend.out.log"
$frontendErrLog = Join-Path $logsDir "dev-frontend.err.log"

$logFiles = @($backendOutLog, $backendErrLog, $frontendOutLog, $frontendErrLog)
foreach ($logFile in $logFiles) {
    if (Test-Path -LiteralPath $logFile) {
        Remove-Item -LiteralPath $logFile -Force -ErrorAction SilentlyContinue
    }
}

$env:DORM_BACKEND_HOST = $BackendHost
$env:DORM_BACKEND_PORT = "$BackendPort"

$backendArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $root "backend\run_backend.ps1")
)

$frontendArgs = @(
    "-m", "http.server", "$FrontendPort", "--bind", $FrontendHost
)

$backendProc = $null
$frontendProc = $null

try {
    $backendStartParams = @{
        FilePath = $pwshExe
        ArgumentList = $backendArgs
        WorkingDirectory = $root
        RedirectStandardOutput = $backendOutLog
        RedirectStandardError = $backendErrLog
        PassThru = $true
    }
    $frontendStartParams = @{
        FilePath = $pythonExe
        ArgumentList = $frontendArgs
        WorkingDirectory = (Join-Path $root "frontend")
        RedirectStandardOutput = $frontendOutLog
        RedirectStandardError = $frontendErrLog
        PassThru = $true
    }

    if (-not $ShowChildWindows) {
        $backendStartParams.WindowStyle = "Hidden"
        $frontendStartParams.WindowStyle = "Hidden"
    }

    $backendProc = Start-Process @backendStartParams
    $frontendProc = Start-Process @frontendStartParams

    $backendUrl = "http://$BackendHost`:$BackendPort/api/health"
    $frontendUrl = "http://$FrontendHost`:$FrontendPort/index.html"

    $backendReady = Wait-HttpReady -Url $backendUrl -TimeoutSeconds 30
    $frontendReady = Wait-HttpReady -Url $frontendUrl -TimeoutSeconds 15

    Write-Output ""
    Write-Output "Dev environment started"
    Write-Output "Backend PID:  $($backendProc.Id)"
    Write-Output "Frontend PID: $($frontendProc.Id)"
    Write-Output "Backend URL:  $backendUrl ($([string]$backendReady).ToUpper())"
    Write-Output "Frontend URL: $frontendUrl ($([string]$frontendReady).ToUpper())"
    Write-Output "Logs:         $backendOutLog"
    Write-Output "              $backendErrLog"
    Write-Output "              $frontendOutLog"
    Write-Output "              $frontendErrLog"
    Write-Output "Child windows: $([bool]$ShowChildWindows)"
    Write-Output "Press Ctrl+C to stop both processes."
    Write-Output ""

    if ($OpenBrowser -and $frontendReady) {
        Start-Process $frontendUrl | Out-Null
    }

    while ($true) {
        Start-Sleep -Seconds 1
        $backendProc.Refresh()
        $frontendProc.Refresh()

        if ($backendProc.HasExited -or $frontendProc.HasExited) {
            Write-Warning "Một trong hai process đã dừng. Đang cleanup..."
            break
        }
    }
} finally {
    Stop-IfRunning -ProcessObject $frontendProc
    Stop-IfRunning -ProcessObject $backendProc
}
