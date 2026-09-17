param(
    [ValidateSet("preflight", "apply", "dry-run")]
    [string]$Mode = "preflight",
    [string]$PythonExecutable = "python",
    [string]$CorpusRoot = $env:KODIT_PRESERVED_CORPUS_ROOT,
    [string]$SummaryPath = ""
)

$ErrorActionPreference = "Stop"
$env:PYTHONDONTWRITEBYTECODE = "1"

if (-not $CorpusRoot) {
    throw "CorpusRoot or KODIT_PRESERVED_CORPUS_ROOT is required"
}

$arguments = @(
    "tools/extractions/backfill_document_extractions.py",
    "--mode", $Mode,
    "--corpus-root", $CorpusRoot
)

if ($SummaryPath) {
    $arguments += @("--summary", $SummaryPath)
}

& $PythonExecutable @arguments
exit $LASTEXITCODE
