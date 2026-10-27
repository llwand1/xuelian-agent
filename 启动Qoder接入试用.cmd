@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\external-agent\start-preview.ps1" -Agent Qoder
if errorlevel 1 pause
