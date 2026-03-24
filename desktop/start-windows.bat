@echo off
title AeroMap - Drone Mapping Platform
color 0A

echo.
echo  ============================================
echo    AeroMap - Drone Mapping Platform
echo    Local Photogrammetry Processing
echo  ============================================
echo.

:: Check Docker
echo [1/4] Checking Docker...
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed.
    echo Please install Docker Desktop from: https://www.docker.com/products/docker-desktop
    echo After installing, enable "Use the WSL 2 based engine" in Docker settings.
    pause
    exit /b 1
)
echo       Docker found.

:: Check NVIDIA GPU
echo [2/4] Detecting GPU...
nvidia-smi >nul 2>&1
if errorlevel 1 (
    echo [WARNING] NVIDIA GPU not detected. Processing will use CPU only (slower).
    set NODEODM_IMAGE=opendronemap/nodeodm
    set GPU_FLAG=
) else (
    echo       NVIDIA GPU detected!
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
    set NODEODM_IMAGE=opendronemap/nodeodm:gpu
    set GPU_FLAG=--gpus all
)

:: Start NodeODM
echo [3/4] Starting NodeODM processing engine...
docker ps -q -f name=aeromap-nodeodm >nul 2>&1
for /f %%i in ('docker ps -q -f name^=aeromap-nodeodm') do set CONTAINER_ID=%%i

if defined CONTAINER_ID (
    echo       NodeODM is already running.
) else (
    echo       Pulling latest NodeODM image (first run may take a few minutes)...
    docker pull %NODEODM_IMAGE%
    echo       Starting NodeODM container...
    if defined GPU_FLAG (
        docker run -d --name aeromap-nodeodm -p 3000:3000 %GPU_FLAG% --restart unless-stopped -v "%CD%\odm-data:/var/www/data" %NODEODM_IMAGE%
    ) else (
        docker run -d --name aeromap-nodeodm -p 3000:3000 --restart unless-stopped -v "%CD%\odm-data:/var/www/data" %NODEODM_IMAGE%
    )
    :: Wait for NodeODM to be ready
    echo       Waiting for NodeODM to start...
    timeout /t 10 /nobreak >nul
)

:: Verify NodeODM connection
curl -s http://localhost:3000/info >nul 2>&1
if errorlevel 1 (
    echo [WARNING] NodeODM is not responding yet. It may still be starting up.
    echo           AeroMap will work in simulation mode until NodeODM is ready.
) else (
    echo       NodeODM is ready!
)

:: Start AeroMap
echo [4/4] Starting AeroMap...
echo.
echo  ============================================
echo    AeroMap is running at: http://localhost:5000
echo    NodeODM engine at:     http://localhost:3000
echo    Press Ctrl+C to stop
echo  ============================================
echo.

set NODE_ENV=production
set NODEODM_URL=http://localhost:3000
node dist\index.cjs
