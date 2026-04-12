@echo off
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" -Message "Deploy TikTok Battle Royale backend"
pause
