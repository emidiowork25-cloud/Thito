@echo off
chcp 65001 >nul
title THITO — abrir junto com o Windows
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem  Coloca um atalho do start.bat na pasta de Inicializar do Windows, para o
rem  THITO ser a primeira coisa que abre quando voce liga o computador.
rem  Para desfazer, rode este arquivo de novo e escolha remover.
rem ---------------------------------------------------------------------------

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "ATALHO=%STARTUP%\THITO.lnk"
set "ALVO=%~dp0start.bat"

echo.
if exist "%ATALHO%" (
  echo   O THITO JA abre junto com o Windows.
  echo.
  choice /c SN /m "   Quer REMOVER a abertura automatica? [S/N]"
  if errorlevel 2 goto :fim
  del "%ATALHO%"
  echo.
  echo   Pronto. O THITO nao abre mais sozinho.
  goto :fim
)

echo   Isso vai fazer o THITO abrir sozinho toda vez que voce ligar o PC.
echo.
choice /c SN /m "   Confirma? [S/N]"
if errorlevel 2 goto :fim

rem Cria o atalho via PowerShell, minimizando a janela preta do servidor.
powershell -NoProfile -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%ATALHO%');" ^
  "$s.TargetPath = '%ALVO%';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.WindowStyle = 7;" ^
  "$s.Description = 'THITO — Hub Pessoal';" ^
  "$s.Save()"

if exist "%ATALHO%" (
  echo.
  echo   Pronto. Da proxima vez que ligar o computador, o THITO abre sozinho.
) else (
  echo.
  echo   [!] Nao consegui criar o atalho. Alternativa manual:
  echo       1^) Aperte Win+R, digite  shell:startup  e de Enter.
  echo       2^) Arraste o start.bat para dentro dessa pasta segurando Alt.
)

:fim
echo.
pause
