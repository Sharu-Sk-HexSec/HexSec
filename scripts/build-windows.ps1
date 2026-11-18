$ErrorActionPreference = 'Stop'
$hexRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $hexRoot
if (-not (Test-Path node_modules/electron/dist/electron.exe)) { throw 'Run npm ci first to install Electron.' }
npm run build:provider
if ($LASTEXITCODE -ne 0) { throw 'Provider build failed.' }
$hexDist = Join-Path $hexRoot 'dist/HexSec-Windows'
$hexCache = Join-Path $hexRoot 'work/downloads'
New-Item -ItemType Directory -Path $hexDist,$hexCache -Force | Out-Null
Copy-Item -Path node_modules/electron/dist/* -Destination $hexDist -Recurse -Force
Copy-Item -LiteralPath (Join-Path $hexDist 'electron.exe') -Destination (Join-Path $hexDist 'HexSec.exe') -Force
$hexApp = Join-Path $hexDist 'resources/app'
New-Item -ItemType Directory -Path $hexApp -Force | Out-Null
# Runtime assets only: provider source and its node_modules stay in the source repository.
Get-ChildItem -LiteralPath app -File | Copy-Item -Destination $hexApp -Force
$hexPythonZip = Join-Path $hexCache 'python314.zip'
if (-not (Test-Path -LiteralPath $hexPythonZip)) { Invoke-WebRequest 'https://www.python.org/ftp/python/3.14.10/python-3.14.10-embed-amd64.zip' -OutFile $hexPythonZip }
$hexPython = Join-Path $hexDist 'resources/python314'
Expand-Archive -LiteralPath $hexPythonZip -DestinationPath $hexPython -Force
$hexSite = Join-Path $hexPython 'Lib/site-packages'
New-Item -ItemType Directory -Path $hexSite -Force | Out-Null
foreach ($hexDependency in @(@('ytmusicapi','1.12.4'),@('requests','2.34.2'),@('charset-normalizer','3.5.2'),@('idna','3.20'),@('urllib3','2.8.0'),@('certifi','2026.10.23'))) {
    $hexMetadata = Invoke-RestMethod "https://pypi.org/pypi/$($hexDependency[0])/$($hexDependency[1])/json"
    $hexWheel = $hexMetadata.urls | Where-Object { $_.filename -match 'py3-none-any\.whl$' } | Select-Object -First 1
    if (-not $hexWheel) { throw "No pure-Python wheel for $($hexDependency[0])" }
    $hexWheelZip = Join-Path $hexCache ($hexWheel.filename + '.zip')
    Invoke-WebRequest $hexWheel.url -OutFile $hexWheelZip
    if ((Get-FileHash -LiteralPath $hexWheelZip -Algorithm SHA256).Hash.ToLower() -ne $hexWheel.digests.sha256) { throw 'Python wheel checksum mismatch.' }
    Expand-Archive -LiteralPath $hexWheelZip -DestinationPath $hexSite -Force
}
Set-Content -LiteralPath (Join-Path $hexPython 'python314._pth') -Value @('python314.zip','.','Lib/site-packages','import site') -Encoding ascii
Copy-Item -LiteralPath README.md -Destination (Join-Path $hexDist 'README.md') -Force
Set-Content -LiteralPath (Join-Path $hexDist 'Start HexSec.cmd') -Value '@start "" "%~dp0HexSec.exe"' -Encoding ascii
$hexZip = Join-Path $hexRoot 'dist/HexSec-Windows.zip'
Compress-Archive -LiteralPath $hexDist -DestinationPath $hexZip -CompressionLevel Fastest -Force
$hexHash = (Get-FileHash -LiteralPath $hexZip -Algorithm SHA256).Hash.ToLower()
Set-Content -LiteralPath (Join-Path $hexRoot 'dist/SHA256SUMS.txt') -Value "$hexHash  HexSec-Windows.zip" -Encoding ascii
Write-Output "Built $hexZip"
