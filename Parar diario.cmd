@echo off
rem Para la base de datos del diario personal. Tus datos se conservan.
title Parar el diario
cd /d "%~dp0"
call npm run diario:parar
echo.
echo  Base de datos del diario parada. Tus entradas siguen guardadas.
pause
