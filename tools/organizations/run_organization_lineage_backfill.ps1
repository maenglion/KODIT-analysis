param([ValidateSet('preflight','apply','verify')][string]$Mode='preflight',[string]$Summary)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$args=@((Join-Path $PSScriptRoot 'backfill_organization_lineage.py'),'--mode',$Mode)
if($Summary){$args+=@('--summary',$Summary)}
Push-Location $repo
try { python @args; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE} }
finally { Pop-Location }
