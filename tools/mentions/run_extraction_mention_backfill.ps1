param(
    [ValidateSet("preflight", "apply", "dry-run")]
    [string]$Mode = "preflight",
    [string]$PythonExecutable = "python",
    [string]$SummaryPath = ""
)

$ErrorActionPreference = "Stop"
$env:PYTHONDONTWRITEBYTECODE = "1"

$mentionPath = Join-Path $PSScriptRoot "..\mentions"
$existingPythonPath = $env:PYTHONPATH
if ($existingPythonPath) {
    $env:PYTHONPATH = "$mentionPath;$existingPythonPath"
} else {
    $env:PYTHONPATH = $mentionPath
}

$arguments = @(
    "tools/mentions/backfill_extraction_mentions.py",
    "--mode", $Mode
)
if ($SummaryPath) {
    $arguments += @("--summary", $SummaryPath)
}

try {
    & $PythonExecutable @arguments
    exit $LASTEXITCODE
} finally {
    if ($existingPythonPath) {
        $env:PYTHONPATH = $existingPythonPath
    } else {
        Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
    }
}
