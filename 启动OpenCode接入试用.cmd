@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\external-agent\start-preview.ps1" -Agent OpenCode
if errorlevel 1 pause
