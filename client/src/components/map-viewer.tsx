import { useEffect, useRef, useState } from "react";
import type { Upload, Project } from "@shared/schema";
import { MapPin, Layers, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MapViewerProps {
  uploads: Upload[];
  project: Project;
}

export function MapViewer({ uploads, project }: MapViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(14);
  const [mapStyle, setMapStyle] = useState<"satellite" | "terrain">("satellite");

  // Phoenix, AZ default coordinates
  const centerLat = project.lat ? parseFloat(project.lat) : 33.4484;
  const centerLng = project.lng ? parseFloat(project.lng) : -111.9737;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.scale(dpr, dpr);
      drawMap(ctx, w, h);
    };

    const drawMap = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      // Background
      if (mapStyle === "satellite") {
        // Dark satellite-like background
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#1a2332");
        grad.addColorStop(0.3, "#1d2b3a");
        grad.addColorStop(0.6, "#1a2830");
        grad.addColorStop(1, "#1c2535");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Terrain features
        const seed = centerLat * 1000 + centerLng * 100;
        for (let i = 0; i < 40; i++) {
          const x = ((Math.sin(seed + i * 7.3) + 1) / 2) * w;
          const y = ((Math.cos(seed + i * 11.1) + 1) / 2) * h;
          const r = 20 + Math.abs(Math.sin(i * 3.7)) * 80;
          const grad2 = ctx.createRadialGradient(x, y, 0, x, y, r);
          grad2.addColorStop(0, "rgba(45, 70, 55, 0.3)");
          grad2.addColorStop(1, "rgba(30, 50, 45, 0)");
          ctx.fillStyle = grad2;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Roads
        ctx.strokeStyle = "rgba(80, 100, 120, 0.3)";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
          const y = ((Math.sin(seed + i * 5.7) + 1) / 2) * h;
          ctx.beginPath();
          ctx.moveTo(0, y);
          for (let x = 0; x < w; x += 20) {
            ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 10);
          }
          ctx.stroke();
        }
        for (let i = 0; i < 6; i++) {
          const x = ((Math.cos(seed + i * 4.3) + 1) / 2) * w;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          for (let y = 0; y < h; y += 20) {
            ctx.lineTo(x + Math.cos(y * 0.01 + i) * 10, y);
          }
          ctx.stroke();
        }

        // Building blocks
        ctx.fillStyle = "rgba(60, 75, 90, 0.25)";
        for (let i = 0; i < 25; i++) {
          const bx = ((Math.sin(seed + i * 13.3) + 1) / 2) * w;
          const by = ((Math.cos(seed + i * 17.7) + 1) / 2) * h;
          const bw = 10 + Math.abs(Math.sin(i * 2.1)) * 30;
          const bh = 10 + Math.abs(Math.cos(i * 3.3)) * 25;
          ctx.fillRect(bx, by, bw, bh);
        }
      } else {
        // Terrain style
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#e8e0d0");
        grad.addColorStop(0.5, "#ddd5c5");
        grad.addColorStop(1, "#e5ddd0");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Contour lines
        ctx.strokeStyle = "rgba(180, 160, 130, 0.4)";
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 15; i++) {
          ctx.beginPath();
          const baseY = (i / 15) * h;
          for (let x = 0; x < w; x += 5) {
            const y = baseY + Math.sin(x * 0.02 + i * 0.5) * 20 + Math.cos(x * 0.01) * 10;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // Grid overlay
      ctx.strokeStyle = mapStyle === "satellite"
        ? "rgba(100, 140, 180, 0.08)"
        : "rgba(150, 130, 100, 0.15)";
      ctx.lineWidth = 0.5;
      const gridSize = 60;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Upload markers
      if (uploads.length > 0) {
        // Scatter markers around center
        uploads.forEach((upload, i) => {
          const angle = (i / uploads.length) * Math.PI * 2;
          const distance = 30 + Math.random() * (Math.min(w, h) * 0.3);
          const px = w / 2 + Math.cos(angle + i * 0.3) * distance;
          const py = h / 2 + Math.sin(angle + i * 0.3) * distance;

          // Photo marker
          ctx.fillStyle = upload.type === "photo" ? "rgba(0, 180, 200, 0.8)" : "rgba(255, 150, 50, 0.8)";
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();

          // Glow
          const glow = ctx.createRadialGradient(px, py, 0, px, py, 12);
          glow.addColorStop(0, upload.type === "photo" ? "rgba(0, 180, 200, 0.2)" : "rgba(255, 150, 50, 0.2)");
          glow.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(px, py, 12, 0, Math.PI * 2);
          ctx.fill();
        });

        // Coverage polygon
        if (uploads.length >= 3) {
          ctx.strokeStyle = "rgba(0, 180, 200, 0.4)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          const cx = w / 2;
          const cy = h / 2;
          const coverageRadius = Math.min(w, h) * 0.35;
          ctx.beginPath();
          ctx.ellipse(cx, cy, coverageRadius, coverageRadius * 0.7, 0.1, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Coverage fill
          ctx.fillStyle = "rgba(0, 180, 200, 0.05)";
          ctx.beginPath();
          ctx.ellipse(cx, cy, coverageRadius, coverageRadius * 0.7, 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Center crosshair
      ctx.strokeStyle = mapStyle === "satellite"
        ? "rgba(255, 255, 255, 0.15)"
        : "rgba(0, 0, 0, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 15, h / 2);
      ctx.lineTo(w / 2 + 15, h / 2);
      ctx.moveTo(w / 2, h / 2 - 15);
      ctx.lineTo(w / 2, h / 2 + 15);
      ctx.stroke();

      // Coordinate label
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.fillStyle = mapStyle === "satellite" ? "rgba(180, 200, 220, 0.6)" : "rgba(80, 70, 60, 0.6)";
      ctx.textAlign = "left";
      ctx.fillText(
        `${centerLat.toFixed(4)}°N, ${Math.abs(centerLng).toFixed(4)}°W`,
        12,
        h - 12
      );
      ctx.textAlign = "right";
      ctx.fillText(`Zoom: ${zoom}x`, w - 12, h - 12);
    };

    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(container);

    return () => ro.disconnect();
  }, [zoom, mapStyle, uploads, centerLat, centerLng]);

  return (
    <div ref={containerRef} className="relative w-full h-full" data-testid="map-viewer">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Map controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
        <Button
          size="sm"
          variant="secondary"
          className="w-8 h-8 p-0 bg-background/80 backdrop-blur"
          onClick={() => setZoom((z) => Math.min(22, z + 1))}
          data-testid="button-zoom-in"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="w-8 h-8 p-0 bg-background/80 backdrop-blur"
          onClick={() => setZoom((z) => Math.max(1, z - 1))}
          data-testid="button-zoom-out"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="w-8 h-8 p-0 bg-background/80 backdrop-blur mt-1"
          onClick={() => setMapStyle((s) => (s === "satellite" ? "terrain" : "satellite"))}
          data-testid="button-map-style"
        >
          <Layers className="w-4 h-4" />
        </Button>
      </div>

      {/* Legend */}
      {uploads.length > 0 && (
        <div className="absolute top-3 left-3 bg-background/80 backdrop-blur rounded-lg p-2.5 text-xs z-10">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
            <span className="text-foreground/70">Photos ({uploads.filter((u) => u.type === "photo").length})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
            <span className="text-foreground/70">Videos ({uploads.filter((u) => u.type === "video").length})</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {uploads.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center bg-background/80 backdrop-blur rounded-xl p-6">
            <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Upload files to see them on the map</p>
          </div>
        </div>
      )}
    </div>
  );
}
