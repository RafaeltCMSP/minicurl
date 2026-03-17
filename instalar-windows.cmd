@echo off
setlocal EnableDelayedExpansion
title MinicUrl - Instalador Windows

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       MinicUrl - Instalador Windows      ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Verifica se Node.js está instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERRO] Node.js nao encontrado!
    echo  Baixe em: https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js encontrado: %NODE_VER%

:: Verifica npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERRO] npm nao encontrado!
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i
echo  [OK] npm encontrado: v%NPM_VER%

:: Obtém o diretório global do npm
echo.
echo  Obtendo diretório global do npm...
for /f "tokens=*" %%i in ('npm root -g') do set NPM_GLOBAL_ROOT=%%i
for /f "tokens=*" %%i in ('npm prefix -g') do set NPM_PREFIX=%%i
echo  [OK] Prefixo global: %NPM_PREFIX%

:: Instala dependências locais
echo.
echo  Instalando dependências...
call npm install --silent
if %errorlevel% neq 0 (
    echo  [ERRO] Falha ao instalar dependências
    pause
    exit /b 1
)
echo  [OK] Dependências instaladas

:: Instala globalmente
echo.
echo  Instalando MinicUrl globalmente...
call npm install -g . --silent
if %errorlevel% neq 0 (
    echo  [AVISO] Instalação global falhou. Tentando método alternativo...
    goto :manual_install
)

:: Testa se funcionou
where minicurl >nul 2>&1
if %errorlevel% eq 0 (
    echo  [OK] MinicUrl instalado com sucesso!
    goto :success
) else (
    echo  [AVISO] Comando não encontrado no PATH. Configurando...
    goto :fix_path
)

:fix_path
:: Adiciona npm prefix ao PATH do usuário
echo.
echo  Adicionando npm ao PATH do sistema...
setx PATH "%NPM_PREFIX%;%PATH%" >nul 2>&1
echo  [OK] PATH atualizado com: %NPM_PREFIX%
echo.
echo  IMPORTANTE: Feche e abra um novo terminal para aplicar o PATH!
goto :success

:manual_install
:: Método alternativo: cria um wrapper .cmd manualmente
echo.
echo  Usando instalação manual (método alternativo)...

set INSTALL_DIR=%NPM_PREFIX%
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copia o projeto para AppData
set APP_DIR=%APPDATA%\minicurl
if exist "%APP_DIR%" rmdir /s /q "%APP_DIR%"
xcopy /s /e /q "." "%APP_DIR%\" >nul
echo  [OK] Arquivos copiados para %APP_DIR%

:: Instala dependências no diretório final
pushd "%APP_DIR%"
call npm install --silent >nul 2>&1
popd

:: Cria o arquivo minicurl.cmd no npm prefix
set CMD_FILE=%NPM_PREFIX%\minicurl.cmd
echo @echo off > "%CMD_FILE%"
echo node "%APP_DIR%\bin\minicurl.js" %%* >> "%CMD_FILE%"
echo  [OK] Criado: %CMD_FILE%

:: Cria também para PowerShell
set PS1_FILE=%NPM_PREFIX%\minicurl.ps1
echo #!/usr/bin/env pwsh > "%PS1_FILE%"
echo node "%APP_DIR%\bin\minicurl.js" $args >> "%PS1_FILE%"
echo  [OK] Criado: %PS1_FILE%

:: Verifica se npm prefix está no PATH
echo %PATH% | findstr /i "%NPM_PREFIX%" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Adicionando %NPM_PREFIX% ao PATH...
    setx PATH "%NPM_PREFIX%;%PATH%" >nul 2>&1
    echo  [OK] PATH atualizado!
)

:success
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║         Instalação Concluída!            ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Para usar:
echo    1. Feche este terminal
echo    2. Abra um NOVO terminal (PowerShell ou CMD)
echo    3. Digite: minicurl
echo.
echo  Se ainda não funcionar, use diretamente:
echo    node "%~dp0bin\minicurl.js"
echo.

:: Cria atalho de emergência na pasta atual
echo @echo off > "%~dp0start.cmd"
echo node "%~dp0bin\minicurl.js" %%* >> "%~dp0start.cmd"
echo  [OK] Atalho criado: start.cmd (use se minicurl nao funcionar)
echo.

pause
