@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo  Agent Studio — Instalacao
echo ========================================
echo.

echo [1/2] Instalando dependencias Python...
pip install -r studio\api\requirements.txt
if errorlevel 1 (
  echo ERRO: Falha ao instalar dependencias Python.
  pause & exit /b 1
)

echo.
echo [2/2] Instalando dependencias Node...
cd studio\ui
npm install
if errorlevel 1 (
  echo ERRO: Falha ao instalar dependencias Node.
  pause & exit /b 1
)

cd /d "%~dp0"
echo.
echo ========================================
echo  Instalacao concluida!
echo  Execute studio.bat para iniciar.
echo ========================================
echo.
pause
