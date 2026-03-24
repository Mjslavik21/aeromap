import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Play,
  Square,
  Battery,
  Compass,
  Camera,
  Wifi,
  WifiOff,
  Signal,
  MapPin,
} from "lucide-react";

interface DroneState {
  x: number;
  y: number;
  heading: number;
  altitude: number;
  speed: number;
  battery: number;
  lat: number;
  lng: number;
}

interface FlightStats {
  distance: number;
  photos: number;
  elapsed: number;
}

const SURVEY_MARGIN = 80;
const SURVEY_ROWS = 6;
const PHOTO_INTERVAL_MS = 2000;

function buildSurveyPath(w: number, h: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const left = SURVEY_MARGIN;
  const right = w - SURVEY_MARGIN;
  const top = SURVEY_MARGIN;
  const bottom = h - SURVEY_MARGIN;
  const rowH = (bottom - top) / (SURVEY_ROWS - 1);

  for (let i = 0; i < SURVEY_ROWS; i++) {
    const y = top + i * rowH;
    if (i % 2 === 0) {
      points.push({ x: left, y }, { x: right, y });
    } else {
      points.push({ x: right, y }, { x: left, y });
    }
  }
  return points;
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, offset: { x: number; y: number }, zoom: number) {
  const spacing = 40 * zoom;
  const ox = offset.x % spacing;
  const oy = offset.y % spacing;

  ctx.strokeStyle = "rgba(100,116,139,0.12)";
  ctx.lineWidth = 1;
  for (let x = ox; x < w; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = oy; y < h; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawSurveyPattern(ctx: CanvasRenderingContext2D, path: { x: number; y: number }[]) {
  if (path.length < 2) return;
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "rgba(94,234,212,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].x, path[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawTrail(ctx: CanvasRenderingContext2D, trail: { x: number; y: number }[]) {
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const alpha = (i / trail.length) * 0.8;
    ctx.strokeStyle = `rgba(45,212,191,${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
}

function drawDrone(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number) {
  // Camera footprint
  ctx.fillStyle = "rgba(45,212,191,0.08)";
  ctx.fillRect(x - 30, y - 30, 60, 60);
  ctx.strokeStyle = "rgba(45,212,191,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 30, y - 30, 60, 60);

  // Drone body
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((heading * Math.PI) / 180);

  ctx.fillStyle = "#2dd4bf";
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();

  // Glow
  ctx.shadowColor = "#2dd4bf";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

export default function LiveMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastPhotoRef = useRef<number>(0);

  const [flying, setFlying] = useState(false);
  const [connected] = useState(true);
  const [drone, setDrone] = useState<DroneState>({
    x: 0, y: 0, heading: 90, altitude: 60, speed: 0, battery: 98, lat: 33.4484, lng: -112.074,
  });
  const [stats, setStats] = useState<FlightStats>({ distance: 0, photos: 0, elapsed: 0 });
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const surveyPath = useRef<{ x: number; y: number }[]>([]);
  const pathIndex = useRef(0);
  const pathProgress = useRef(0);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const statsRef = useRef<FlightStats>({ distance: 0, photos: 0, elapsed: 0 });
  const droneRef = useRef(drone);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Build survey path when size changes
  useEffect(() => {
    surveyPath.current = buildSurveyPath(size.w, size.h);
  }, [size]);

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid(ctx, canvas.width, canvas.height, { x: 0, y: 0 }, 1);
    drawSurveyPattern(ctx, surveyPath.current);
    drawTrail(ctx, trailRef.current);

    const d = droneRef.current;
    if (d.x || d.y) {
      drawDrone(ctx, d.x, d.y, d.heading);
    }

    animRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [render]);

  // Animation update loop when flying
  useEffect(() => {
    if (!flying) return;

    const path = surveyPath.current;
    if (path.length < 2) return;

    // Initialize
    pathIndex.current = 0;
    pathProgress.current = 0;
    trailRef.current = [{ ...path[0] }];
    statsRef.current = { distance: 0, photos: 0, elapsed: 0 };
    startTimeRef.current = performance.now();
    lastPhotoRef.current = performance.now();
    droneRef.current = { ...droneRef.current, x: path[0].x, y: path[0].y, speed: 5 };

    const speed = 2; // pixels per frame
    let active = true;

    const tick = () => {
      if (!active) return;
      const idx = pathIndex.current;
      if (idx >= path.length - 1) {
        // Flight done
        droneRef.current = { ...droneRef.current, speed: 0 };
        setDrone({ ...droneRef.current });
        setFlying(false);
        setStats({ ...statsRef.current });
        setTrail([...trailRef.current]);
        return;
      }

      const from = path[idx];
      const to = path[idx + 1];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      const heading = (Math.atan2(dx, -dy) * 180) / Math.PI;

      pathProgress.current += speed;
      if (pathProgress.current >= segLen) {
        pathProgress.current -= segLen;
        pathIndex.current++;
      }

      const t = Math.min(pathProgress.current / segLen, 1);
      const nx = from.x + dx * t;
      const ny = from.y + dy * t;

      // Update trail
      trailRef.current.push({ x: nx, y: ny });
      if (trailRef.current.length > 500) trailRef.current.shift();

      // Distance
      const last = trailRef.current[trailRef.current.length - 2];
      if (last) {
        const dd = Math.sqrt((nx - last.x) ** 2 + (ny - last.y) ** 2);
        statsRef.current.distance += dd * 0.5; // scale to meters
      }

      // Photos
      const now = performance.now();
      if (now - lastPhotoRef.current > PHOTO_INTERVAL_MS) {
        statsRef.current.photos++;
        lastPhotoRef.current = now;
      }

      // Elapsed
      statsRef.current.elapsed = (now - startTimeRef.current) / 1000;

      // Battery drain
      const bat = Math.max(5, 98 - statsRef.current.elapsed * 0.05);

      const newDrone: DroneState = {
        x: nx, y: ny, heading, altitude: 60 + Math.sin(now / 3000) * 2,
        speed: 5.0 + Math.sin(now / 2000) * 0.3, battery: bat,
        lat: 33.4484 + ny * 0.00001, lng: -112.074 + nx * 0.00001,
      };
      droneRef.current = newDrone;

      // Sync to React state every 10 frames for HUD
      if (Math.random() < 0.15) {
        setDrone({ ...newDrone });
        setStats({ ...statsRef.current });
        setTrail([...trailRef.current]);
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => { active = false; };
  }, [flying]);

  const handleStart = () => {
    if (flying) {
      setFlying(false);
    } else {
      setTrail([]);
      trailRef.current = [];
      setStats({ distance: 0, photos: 0, elapsed: 0 });
      setFlying(true);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 relative" data-testid="live-map-page">
      {/* Top bar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <Badge
            variant="outline"
            className={`gap-1.5 ${connected ? "border-emerald-500/50 text-emerald-400" : "border-red-500/50 text-red-400"}`}
            data-testid="badge-connection"
          >
            {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {connected ? "Connected" : "Disconnected"}
          </Badge>
          <Badge variant="outline" className="gap-1.5 border-slate-600 text-slate-300">
            <Signal className="w-3 h-3" />
            GPS 12 sats
          </Badge>
        </div>
        <div className="pointer-events-auto">
          <Button
            onClick={handleStart}
            variant={flying ? "destructive" : "default"}
            className={!flying ? "bg-teal-600 hover:bg-teal-700 text-white" : ""}
            data-testid="button-start-flight"
          >
            {flying ? <Square className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {flying ? "Stop Flight" : "Start Demo Flight"}
          </Button>
        </div>
      </div>

      {/* Canvas map */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          width={size.w}
          height={size.h}
          className="absolute inset-0"
          data-testid="canvas-map"
        />
      </div>

      {/* Telemetry HUD */}
      <div className="absolute bottom-4 left-4 z-10">
        <Card className="bg-slate-800/90 border-slate-700 backdrop-blur-sm p-3 min-w-[220px]" data-testid="card-telemetry">
          <div className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Telemetry</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <div className="flex items-center gap-1.5 text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-teal-400" />
              <span className="tabular-nums">{drone.altitude.toFixed(1)}m</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <Compass className="w-3.5 h-3.5 text-teal-400" />
              <span className="tabular-nums">{drone.heading.toFixed(0)}°</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <Play className="w-3.5 h-3.5 text-teal-400" />
              <span className="tabular-nums">{drone.speed.toFixed(1)} m/s</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <Battery className={`w-3.5 h-3.5 ${drone.battery > 20 ? "text-emerald-400" : "text-red-400"}`} />
              <span className="tabular-nums">{drone.battery.toFixed(0)}%</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-700 text-xs text-slate-400 tabular-nums">
            {drone.lat.toFixed(6)}, {drone.lng.toFixed(6)}
          </div>
        </Card>
      </div>

      {/* Stats panel */}
      <div className="absolute bottom-4 right-4 z-10">
        <Card className="bg-slate-800/90 border-slate-700 backdrop-blur-sm p-3 min-w-[180px]" data-testid="card-stats">
          <div className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Flight Stats</div>
          <div className="space-y-1.5 text-sm text-slate-300">
            <div className="flex justify-between">
              <span>Distance</span>
              <span className="tabular-nums">{stats.distance.toFixed(0)}m</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> Photos</span>
              <span className="tabular-nums">{stats.photos}</span>
            </div>
            <div className="flex justify-between">
              <span>Flight time</span>
              <span className="tabular-nums">{formatTime(stats.elapsed)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
