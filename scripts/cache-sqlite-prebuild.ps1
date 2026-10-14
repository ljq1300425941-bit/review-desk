$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $repositoryRoot 'node_modules/better-sqlite3/package.json'
if (-not (Test-Path -LiteralPath $packagePath)) {
    throw 'Run npm ci --ignore-scripts --cache .npm-cache first.'
}
$platform = (& node -p 'process.platform').Trim()
$architecture = (& node -p 'process.arch').Trim()
$nodeAbi = (& node -p 'process.versions.modules').Trim()
if ($platform -ne 'win32' -or $architecture -notin @('x64', 'arm64') -or $nodeAbi -notmatch '^\d+$') {
    throw 'This helper supports Windows x64/arm64 only.'
}
$packageVersion = (Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).version
if ($packageVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Unexpected dependency version.' }
$assetName = "better-sqlite3-v$packageVersion-node-v$nodeAbi-win32-$architecture.tar.gz"
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/WiseLibs/better-sqlite3/releases/tags/v$packageVersion" -Headers @{'User-Agent'='Review-Desk-Setup'} -TimeoutSec 30
$asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
if (-not $asset -or $asset.digest -notmatch '^sha256:[0-9a-f]{64}$') {
    throw 'No official prebuild with a SHA-256 digest matches this Node.js version and architecture.'
}
if (-not $asset.browser_download_url.StartsWith('https://github.com/WiseLibs/better-sqlite3/releases/download/')) {
    throw 'Unexpected download host.'
}
$archiveDirectory = Join-Path $repositoryRoot 'output/setup'
$cacheDirectory = Join-Path $repositoryRoot '.npm-cache/_prebuilds'
New-Item -ItemType Directory -Force -Path $archiveDirectory, $cacheDirectory | Out-Null
$archivePath = Join-Path $archiveDirectory $assetName
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $archivePath -TimeoutSec 45
$actualDigest = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualDigest -ne $asset.digest.Substring(7).ToLowerInvariant()) { throw 'Official prebuild digest mismatch.' }
$sha512 = [Security.Cryptography.SHA512]::Create()
try {
    $urlDigest = [BitConverter]::ToString($sha512.ComputeHash([Text.Encoding]::UTF8.GetBytes($asset.browser_download_url))).Replace('-', '').ToLowerInvariant().Substring(0, 6)
} finally { $sha512.Dispose() }
$cacheName = $urlDigest + '-' + [regex]::Replace($assetName, '[^a-zA-Z0-9.]+', '-')
Copy-Item -LiteralPath $archivePath -Destination (Join-Path $cacheDirectory $cacheName)
Write-Output "Verified official prebuild cached: $assetName"
Write-Output "SHA-256: $actualDigest"
Write-Output 'Next: npm rebuild --cache .npm-cache'
