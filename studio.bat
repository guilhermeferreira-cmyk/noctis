@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo  Agent Studio
echo  API : http://localhost:5501
echo  UI  : http://localhost:5502
echo ========================================
echo.

start "Agent Studio - API" cmd /k "cd /d "%~dp0studio\api" && uvicorn main:app --reload --port 5501"
timeout /t 2 /nobreak > nul
start "Agent Studio - UI" cmd /k "cd /d "%~dp0studio\ui" && npm run dev"
timeout /t 4 /nobreak > nul
start http://localhost:5502
