# MinicUrl - Script de instalação para PowerShell
# Execute com: powershell -ExecutionPolicy Bypass -File instalar.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║    MinicUrl - Instalador PowerShell      ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Verifica Node.js
try {
    $nodeVersion = node --version 2>&1
    Write-Host "  [OK] Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  [ERRO] Node.js não encontrado!" -ForegroundColor Red
    Write-Host "  Baixe em: https://nodejs.org" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# 2. Instala dependências
Write-Host "  Instalando dependências (npm install)..." -ForegroundColor Yellow
npm install --silent
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERRO] Falha no npm install" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Dependências instaladas" -ForegroundColor Green

# 3. Tenta instalar globalmente
Write-Host "  Instalando globalmente (npm install -g .)..." -ForegroundColor Yellow
npm install -g . 2>&1 | Out-Null

# 4. Verifica se funcionou
$npmPrefix = npm prefix -g 2>&1
Write-Host "  [INFO] npm prefix global: $npmPrefix" -ForegroundColor Gray

# 5. Verifica se minicurl está no PATH
$found = Get-Command minicurl -ErrorAction SilentlyContinue
if ($found) {
    Write-Host "  [OK] 'minicurl' está disponível no PATH!" -ForegroundColor Green
} else {
    Write-Host "  [AVISO] 'minicurl' não encontrado no PATH. Corrigindo..." -ForegroundColor Yellow

    # Adiciona npm prefix ao PATH do usuário
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$npmPrefix*") {
        [Environment]::SetEnvironmentVariable(
            "Path",
            "$npmPrefix;$currentPath",
            "User"
        )
        Write-Host "  [OK] '$npmPrefix' adicionado ao PATH do usuário" -ForegroundColor Green
    }

    # Atualiza o PATH da sessão atual
    $env:Path = "$npmPrefix;$env:Path"

    # Testa novamente
    $found2 = Get-Command minicurl -ErrorAction SilentlyContinue
    if ($found2) {
        Write-Host "  [OK] Funcionando nesta sessão!" -ForegroundColor Green
    } else {
        Write-Host "  [INFO] Requer novo terminal para aplicar" -ForegroundColor Yellow
    }
}

# 6. Cria start.ps1 de emergência na pasta atual
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$startScript = Join-Path $scriptDir "start.ps1"
@"
# Inicia MinicUrl diretamente
`$dir = Split-Path -Parent `$MyInvocation.MyCommand.Path
node "`$dir\bin\minicurl.js" @args
"@ | Set-Content $startScript -Encoding UTF8
Write-Host "  [OK] Atalho criado: start.ps1" -ForegroundColor Green

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║           Pronto!                        ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  OPÇÃO 1 - Novo terminal:" -ForegroundColor White
Write-Host "    minicurl" -ForegroundColor Green
Write-Host ""
Write-Host "  OPÇÃO 2 - Nesta pasta (funciona agora):" -ForegroundColor White
Write-Host "    node bin\minicurl.js" -ForegroundColor Green
Write-Host "    .\start.ps1" -ForegroundColor Green
Write-Host ""
Write-Host "  OPÇÃO 3 - Se ainda der erro de ExecutionPolicy:" -ForegroundColor White
Write-Host "    powershell -ExecutionPolicy Bypass -File instalar.ps1" -ForegroundColor Yellow
Write-Host ""
