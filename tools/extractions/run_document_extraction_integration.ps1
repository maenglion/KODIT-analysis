param(
    [string]$PythonExecutable = "python",
    [string]$HwpPath = $env:KODIT_TEST_HWP_PATH,
    [string]$HwpxPath = $env:KODIT_TEST_HWPX_PATH,
    [string]$PdfPath = $env:KODIT_TEST_PDF_PATH
)

$ErrorActionPreference = "Stop"
$env:PYTHONDONTWRITEBYTECODE = "1"

if ($HwpPath) { $env:KODIT_TEST_HWP_PATH = $HwpPath }
if ($HwpxPath) { $env:KODIT_TEST_HWPX_PATH = $HwpxPath }
if ($PdfPath) { $env:KODIT_TEST_PDF_PATH = $PdfPath }

& $PythonExecutable -m pytest `
    -q `
    -p no:cacheprovider `
    -m integration `
    workers/collector/test_document_extraction_integration.py

exit $LASTEXITCODE
