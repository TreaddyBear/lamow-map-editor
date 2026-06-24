$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$node = "C:\Users\Owner\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$vite = Join-Path $workspace "node_modules\vite\bin\vite.js"
$stdout = Join-Path $workspace ".vite-dev.out.log"
$stderr = Join-Path $workspace ".vite-dev.err.log"

if (-not (Test-Path $node)) {
  throw "Bundled Node was not found at $node"
}

if (-not (Test-Path $vite)) {
  throw "Vite was not found at $vite. Run pnpm install first."
}

$existing = Get-NetTCPConnection -LocalPort 5191 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  $existing | Select-Object LocalAddress, LocalPort, State, OwningProcess
  exit 0
}

$process = Start-Process `
  -FilePath $node `
  -ArgumentList @($vite, "--host", "127.0.0.1", "--port", "5191", "--strictPort") `
  -WorkingDirectory $workspace `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 2

$listener = Get-NetTCPConnection -LocalPort 5191 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
  if (Test-Path $stdout) { Get-Content $stdout }
  if (Test-Path $stderr) { Get-Content $stderr }
  throw "Vite did not start on port 5191. Process id: $($process.Id)"
}

$listener | Select-Object LocalAddress, LocalPort, State, OwningProcess
