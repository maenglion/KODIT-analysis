param([Parameter(Mandatory=$true)][string]$PrivateRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod })[0]
function Await($Operation, [Type]$Type) {
    $task = $asTask.MakeGenericMethod($Type).Invoke($null,@($Operation))
    $task.GetAwaiter().GetResult()
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ko-KR'))
if (-not $engine) { throw 'Korean Windows OCR unavailable' }
$inventory = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PrivateRoot 'inventory.json') | ConvertFrom-Json
foreach ($doc in $inventory) {
    if ($doc.parse_status -ne 'NEEDS_OCR') { continue }
    $folder = Join-Path $PrivateRoot ('documents/' + $doc.document_id)
    if (Test-Path -LiteralPath (Join-Path $folder 'ocr-blocks.json')) { continue }
    $prefix = Join-Path $folder 'ocr-page'
    if ($doc.format -eq '.pdf') {
        & pdftoppm -scale-to 2400 -png (Join-Path $folder 'source.pdf') $prefix
        if ($LASTEXITCODE -ne 0) { throw 'PDF rendering failed' }
    } elseif ($doc.format -in @('.png','.jpg','.jpeg')) {
        Copy-Item -LiteralPath (Join-Path $folder ('source'+$doc.format)) -Destination ($prefix+'-1.png')
    } else { continue }
    $blocks = @()
    foreach ($png in (Get-ChildItem -LiteralPath $folder -Filter 'ocr-page-*.png' | Sort-Object Name)) {
        $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($png.FullName)) ([Windows.Storage.StorageFile])
        $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $blocks += @{locator=('ocr:'+$png.BaseName); text=$result.Text; method='Windows.Media.Ocr ko-KR'; review_status='unverified'}
        $bitmap.Dispose(); $stream.Dispose()
    }
    ConvertTo-Json -Depth 8 -InputObject @($blocks) | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $folder 'ocr-blocks.json')
    Write-Output ($doc.document_id + ' pages=' + $blocks.Count)
}
