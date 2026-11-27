@echo off
rem ============================================================
rem  Diario cifrado - arranque con doble clic (Windows)
rem  Abre Docker si hace falta, arranca el diario personal y
rem  abre el navegador. Cierra esta ventana para parar la app.
rem ============================================================
setlocal
title Diario cifrado
cd /d "%~dp0"

echo.
echo  Diario cifrado
echo  --------------

docker info >nul 2>&1
if errorlevel 1 (
  echo  Abriendo Docker Desktop y esperando a que arranque...
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  powershell -NoProfile -Command "for($t=0;$t -lt 240;$t+=3){ docker info *> $null; if($LASTEXITCODE -eq 0){ exit 0 }; Start-Sleep 3 }; exit 1"
  if errorlevel 1 (
    echo.
    echo  No se ha podido arrancar Docker. Abre Docker Desktop a mano,
    echo  espera a que indique "Engine running" y vuelve a abrir este archivo.
    pause
    exit /b 1
  )
)

if not exist "node_modules\" (
  echo  Instalando dependencias, solo la primera vez...
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

rem Abre el navegador en cuanto la app responda (salvo con DIARIO_SIN_NAVEGADOR=1).
if not defined DIARIO_SIN_NAVEGADOR start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 200;$i++){ try { Invoke-WebRequest -UseBasicParsing 'http://localhost:3500/login' -TimeoutSec 3 | Out-Null; Start-Process 'http://localhost:3500'; exit } catch {}; Start-Sleep 3 }"

call npm run diario
echo.
echo  Para cerrar el diario, cierra esta ventana.
echo  Para apagar tambien la base de datos, usa "Parar diario.cmd".
pause >nul
