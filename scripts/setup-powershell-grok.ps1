<#
.SYNOPSIS
  Actualiza PowerShell 7 e instala Grok CLI (xAI) en Windows.
.USAGE
  irm https://raw.githubusercontent.com/csilvasantin/tool/main/scripts/setup-powershell-grok.ps1 | iex
  # o local:
  pwsh -ExecutionPolicy Bypass -File scripts/setup-powershell-grok.ps1
#>
$ErrorActionPreference = 'Stop'

function Step($m){ Write-Host "`n== $m" -ForegroundColor Cyan }

# 1. PowerShell 7 (instala o actualiza vía winget)
Step "PowerShell 7"
if (Get-Command winget -ErrorAction SilentlyContinue) {
  winget install --id Microsoft.PowerShell --source winget --accept-source-agreements --accept-package-agreements --silent
  if ($LASTEXITCODE -ne 0) { winget upgrade --id Microsoft.PowerShell --source winget --accept-source-agreements --accept-package-agreements --silent }
} else {
  Write-Warning "winget no disponible. Instalando PowerShell con el script oficial de Microsoft."
  Invoke-Expression "& { $(Invoke-RestMethod https://aka.ms/install-powershell.ps1) } -UseMSI -Quiet"
}
$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwsh) { & pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()' | ForEach-Object { Write-Host "pwsh $_" } }

# 2. Grok CLI (xAI). Instalador oficial; fallback a npm.
Step "Grok CLI"
try {
  Invoke-RestMethod https://x.ai/cli/install.ps1 | Invoke-Expression
} catch {
  Write-Warning "Instalador oficial falló ($_). Probando npm."
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    winget install --id OpenJS.NodeJS.LTS --source winget --accept-source-agreements --accept-package-agreements --silent
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  }
  npm install -g @xai-official/grok
}

# 3. PATH y verificación
$grokBin = Join-Path $env:USERPROFILE '.grok\bin'
if ((Test-Path $grokBin) -and ($env:Path -notlike "*$grokBin*")) { $env:Path += ";$grokBin" }
$grok = Get-Command grok -ErrorAction SilentlyContinue
if ($grok) {
  & grok --version
  Write-Host "`nListo. Abre un terminal nuevo y ejecuta 'grok' para iniciar sesión (o exporta XAI_API_KEY)." -ForegroundColor Green
} else {
  Write-Warning "grok no está en PATH todavía. Abre un terminal nuevo y ejecuta 'grok --version'."
}
