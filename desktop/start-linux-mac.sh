#!/bin/bash
set -e

echo ""
echo "  ============================================"
echo "    AeroMap - Drone Mapping Platform"
echo "    Local Photogrammetry Processing"
echo "  ============================================"
echo ""

# Check Docker
echo "[1/4] Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed."
    echo "Install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi
echo "       Docker found."

# Check NVIDIA GPU
echo "[2/4] Detecting GPU..."
NODEODM_IMAGE="opendronemap/nodeodm"
GPU_FLAG=""

if command -v nvidia-smi &> /dev/null; then
    echo "       NVIDIA GPU detected!"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || true
    
    # Check if nvidia-container-toolkit is installed
    if docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
        NODEODM_IMAGE="opendronemap/nodeodm:gpu"
        GPU_FLAG="--gpus all"
        echo "       GPU acceleration enabled!"
    else
        echo "[WARNING] nvidia-container-toolkit not installed."
        echo "          Install it for GPU acceleration: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html"
        echo "          Falling back to CPU processing."
    fi
else
    echo "       No NVIDIA GPU detected. Processing will use CPU only (slower)."
fi

# Start NodeODM
echo "[3/4] Starting NodeODM processing engine..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/odm-data"
mkdir -p "$DATA_DIR"

if [ "$(docker ps -q -f name=aeromap-nodeodm)" ]; then
    echo "       NodeODM is already running."
else
    # Remove stopped container if exists
    docker rm aeromap-nodeodm 2>/dev/null || true
    
    echo "       Pulling latest NodeODM image (first run may take a few minutes)..."
    docker pull "$NODEODM_IMAGE"
    
    echo "       Starting NodeODM container..."
    docker run -d \
        --name aeromap-nodeodm \
        -p 3000:3000 \
        $GPU_FLAG \
        --restart unless-stopped \
        -v "$DATA_DIR:/var/www/data" \
        "$NODEODM_IMAGE"
    
    echo "       Waiting for NodeODM to start..."
    sleep 10
fi

# Verify NodeODM
if curl -s http://localhost:3000/info > /dev/null 2>&1; then
    echo "       NodeODM is ready!"
else
    echo "[WARNING] NodeODM is not responding yet. It may still be starting up."
    echo "          AeroMap will work in simulation mode until NodeODM is ready."
fi

# Start AeroMap
echo "[4/4] Starting AeroMap..."
echo ""
echo "  ============================================"
echo "    AeroMap is running at: http://localhost:5000"
echo "    NodeODM engine at:     http://localhost:3000"
echo "    Press Ctrl+C to stop"
echo "  ============================================"
echo ""

export NODE_ENV=production
export NODEODM_URL=http://localhost:3000
cd "$SCRIPT_DIR/.."
node dist/index.cjs
