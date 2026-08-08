@echo off
chcp 65001 >nul
title THITO — Hub Pessoal
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem  O THITO precisa rodar em um servidor local (http://), nao direto do arquivo.
rem  Modulos JavaScript e o banco local (IndexedDB) nao funcionam em file://.
rem  Este script sobe um servidor minusculo so na sua maquina e abre o navegador.
rem ---------------------------------------------------------------------------

set PORT=7331

echo.
echo   THITO — subindo o hub em http://localhost:%PORT%
echo.

rem --- 1) Escolhe o motor disponivel: Python, depois Node ---------------------
set ENGINE=
where python >nul 2>nul && set ENGINE=python
if not defined ENGINE (where py >nul 2>nul && set ENGINE=py)
if not defined ENGINE (where node >nul 2>nul && set ENGINE=node)

if not defined ENGINE (
  echo   [!] Nao encontrei Python nem Node.js neste computador.
  echo.
  echo       Instale um dos dois — sao gratuitos e levam 2 minutos:
  echo         Python ..: https://www.python.org/downloads/  ^(marque "Add to PATH"^)
  echo         Node.js .: https://nodejs.org/
  echo.
  echo       Depois e so rodar este arquivo de novo.
  echo.
  pause
  exit /b 1
)

rem --- 2) Abre o navegador em modo aplicativo (sem barra de enderecos) --------
rem     O microfone so e liberado em http://localhost, entao a URL e essa.
set URL=http://localhost:%PORT%/index.html
set CHROME=

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined CHROME if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "CHROME=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if defined CHROME (
  start "" "%CHROME%" --app=%URL% --new-window
) else (
  echo   [i] Chrome/Edge nao encontrados. Abrindo no navegador padrao.
  echo       Aviso: o reconhecimento de voz so funciona no Chrome ou no Edge.
  start "" %URL%
)

rem --- 3) Sobe o servidor (segura esta janela; fechar ela derruba o hub) ------
echo   Servidor rodando. Feche esta janela para desligar o THITO.
echo.
echo   [dica] Instale o THITO como aplicativo: no menu (tres pontinhos) do Chrome,
echo          "Transmitir, salvar e compartilhar" ^> "Instalar pagina como app".
echo          Depois disso ele ganha icone no menu Iniciar e abre sozinho,
echo          sem esta janela e sem servidor. Veja o README.
echo.

if "%ENGINE%"=="python" python -m http.server %PORT% --bind 127.0.0.1
if "%ENGINE%"=="py"     py -m http.server %PORT% --bind 127.0.0.1
if "%ENGINE%"=="node"   npx --yes serve -l %PORT% -s .
