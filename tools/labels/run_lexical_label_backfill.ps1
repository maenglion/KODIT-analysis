param(
  [ValidateSet('preflight', 'apply', 'dry-run')]
  [string]$Mode = 'preflight',
  [string]$Summary
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$python = Get-Command python -ErrorAction Stop
$arguments = @(
  (Join-Path $PSScriptRoot 'backfill_lexical_labels.py'),
  '--mode', $Mode
)
if ($Summary) {
  $arguments += @('--summary', $Summary)
}

Push-Location $repo
try {
  & $python.Source @arguments
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}
