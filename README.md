# AeroMap - Drone Mapping Platform

A self-hosted, DroneDeploy-style web application for processing drone photos and videos into 3D models, orthomosaics, and point clouds. Uses **OpenDroneMap** (via NodeODM) for real photogrammetry processing on your own GPU.

## Features

- **Upload** drone photos, videos, and 360° camera footage (Insta360, Ricoh Theta, GoPro MAX)
- **Real photogrammetry processing** via OpenDroneMap — generates 3D models, orthomosaics, point clouds, and DSMs
- **GPU accelerated** — uses your NVIDIA GPU for fast processing
- **Upload progress** — real-time progress bar with percentage and file size tracking
- **Processing pipeline** — live progress through Aligning → Dense Point Cloud → Meshing → Texturing stages
- **3D model viewer** — interactive Three.js viewer with orbit, zoom, and auto-rotation
- **Map viewer** — see your flight coverage area
- **Dark/light mode** — automatic theme detection
- **Simulation mode** — works without NodeODM for demos/testing

## Architecture

```
┌─────────────────────────────────────┐
│  AeroMap (React + Express)          │
│  Port 5000                          │
│  - Web UI (uploads, processing,     │
│    3D viewer, map)                  │
│  - REST API + SQLite database       │
│  - File management                  │
└──────────┬──────────────────────────┘
           │ REST API calls
           ▼
┌─────────────────────────────────────┐
│  NodeODM (Docker container)         │
│  Port 3000                          │
│  - OpenDroneMap processing engine   │
│  - GPU acceleration (CUDA)          │
│  - Outputs: 3D models, orthophotos, │
│    point clouds, DSMs               │
└─────────────────────────────────────┘
```

## Requirements

- **Node.js** 18+ (for AeroMap server)
- **Docker** (for NodeODM processing engine)
- **NVIDIA GPU** (recommended) with:
  - NVIDIA drivers installed
  - nvidia-container-toolkit (for Docker GPU access)
- **8GB+ RAM** (16GB+ recommended for large datasets)
- **SSD storage** (processing is I/O intensive)

## Quick Start

### Option 1: One-Command Setup (Docker Compose)

**With NVIDIA GPU:**
```bash
docker-compose up -d
```

**Without NVIDIA GPU (CPU only, slower):**
```bash
docker-compose -f docker-compose.cpu.yml up -d
```

Then start AeroMap:
```bash
npm install
npm run build
NODE_ENV=production NODEODM_URL=http://localhost:3000 node dist/index.cjs
```

Open http://localhost:5000

### Option 2: Platform-Specific Launchers

**Windows:**
```
desktop\start-windows.bat
```

**Linux / macOS:**
```bash
./desktop/start-linux-mac.sh
```

These scripts automatically:
1. Check for Docker
2. Detect your NVIDIA GPU
3. Pull and start NodeODM (GPU or CPU version)
4. Start AeroMap
5. Open at http://localhost:5000

### Option 3: Manual Setup

1. **Start NodeODM:**
```bash
# With GPU
docker run -d -p 3000:3000 --gpus all --name aeromap-nodeodm opendronemap/nodeodm:gpu

# Without GPU
docker run -d -p 3000:3000 --name aeromap-nodeodm opendronemap/nodeodm
```

2. **Start AeroMap:**
```bash
cd aeromap
npm install
npm run build
NODE_ENV=production NODEODM_URL=http://localhost:3000 node dist/index.cjs
```

3. Open http://localhost:5000

## GPU Setup Guide

### Windows

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
2. Enable WSL 2 backend in Docker settings
3. Install latest [NVIDIA drivers](https://www.nvidia.com/drivers)
4. In Docker Desktop settings, ensure "Use the WSL 2 based engine" is checked
5. GPU passthrough works automatically with Docker Desktop + WSL 2

### Linux (Ubuntu/Debian)

1. Install Docker:
```bash
curl -fsSL https://get.docker.com | sh
```

2. Install NVIDIA Container Toolkit:
```bash
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

3. Verify GPU access:
```bash
docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
```

## Processing Workflow

1. **Create a project** — give it a name and location
2. **Upload images** — drag and drop drone photos (minimum ~20 images with good overlap for best results)
3. **Click Process** — if NodeODM is connected (green indicator), images are sent for real processing
4. **Monitor progress** — the Processing tab shows live progress through each stage
5. **View results** — 3D model viewer, orthomosaic map, and downloadable outputs

## Tips for Best Results

- **Overlap:** 70-80% front overlap, 60-70% side overlap between images
- **Image count:** Minimum 20 images, 50-200 for detailed models
- **GPS data:** Images with EXIF GPS data produce georeferenced outputs
- **Lighting:** Consistent lighting, avoid harsh shadows
- **360° cameras:** AeroMap auto-detects Insta360, Ricoh Theta, and GoPro MAX footage

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODEODM_URL` | `http://localhost:3000` | NodeODM server URL |
| `NODE_ENV` | `development` | Set to `production` for production build |
| `PORT` | `5000` | AeroMap server port |

## Tech Stack

- **Frontend:** React, Three.js, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend:** Express, SQLite (Drizzle ORM), Multer
- **Processing:** OpenDroneMap via NodeODM REST API
- **3D Viewer:** Three.js with orbit controls
- **File formats:** JPG, PNG, TIFF, DNG, RAW, MP4, MOV, INSV, INSP

## License

Open source — built with OpenDroneMap (AGPL-3.0).
