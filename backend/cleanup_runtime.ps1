$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$runtimeDir = Join-Path $scriptDir "runtime"
$tmpDir = Join-Path $runtimeDir "tmp"
$logsDir = Join-Path $runtimeDir "logs"

if (!(Test-Path -LiteralPath $tmpDir)) {
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
}
if (!(Test-Path -LiteralPath $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

Get-ChildItem -LiteralPath $tmpDir -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -eq ".gitkeep") { return }
    try {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
    } catch {
        Write-Output "skip-temp: $($_.FullName)"
    }
}

Get-ChildItem -LiteralPath $logsDir -Force -ErrorAction SilentlyContinue | Where-Object {
    $_.PSIsContainer -eq $false -and $_.LastWriteTime -lt (Get-Date).AddDays(-14)
} | ForEach-Object {
    if ($_.Name -eq ".gitkeep") { return }
    try {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
    } catch {
        Write-Output "skip-log: $($_.FullName)"
    }
}

$legacy = @(".tmp_py", ".tmp_pip")
foreach ($name in $legacy) {
    $path = Join-Path $rootDir $name
    if (Test-Path -LiteralPath $path) {
        $ts = Get-Date -Format "yyyyMMdd_HHmmss"
        $target = Join-Path $rootDir "${name}_quarantine_$ts"
        try {
            Move-Item -LiteralPath $path -Destination $target -ErrorAction Stop
            Write-Output "quarantined: $target"
        } catch {
            Write-Output "locked-legacy: $path"
        }
    }
}

Write-Output "runtime-cleanup-done"
