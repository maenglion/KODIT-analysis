param(
  [ValidateSet('preflight','apply','verify')][string]$Mode='preflight',
  [string]$Summary=''
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$arguments=@((Join-Path $PSScriptRoot 'backfill_org_work_attribution.py'),'--mode',$Mode)
if($Summary){$arguments+=@('--summary',$Summary)}
Push-Location $repo
try {
  python @arguments
  if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
}
finally { Pop-Location }
