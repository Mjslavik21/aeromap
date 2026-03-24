import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  Download,
  Trash2,
  MapPin,
  Clock,
  Camera,
  Ruler,
  Grid3X3,
} from "lucide-react";

interface Waypoint {
  lat: number;
  lng: number;
}

interface CanvasState {
  offset: { x: number; y: number };
  zoom: number;
  dragging: boolean;
  dragStart: { x: number; y: number };
}

const PATTERNS = ["Grid", "Double Grid", "Circular", "Perimeter"] as const;
const INTERVALS = ["1", "2", "3", "5"] as const;

function worldToCanvas(
  wp: Waypoint,
  w: number,
  h: number,
  offset: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  return {
    x: w / 2 + (wp.lng * 8000 + offset.x) * zoom,
    y: h / 2 + (-wp.lat * 8000 + offset.y) * zoom,
  };
}

function canvasToWorld(
  cx: number,
  cy: number,
  w: number,
  h: number,
  offset: { x: number; y: number },
  zoom: number,
): Waypoint {
  return {
    lng: (cx - w / 2) / zoom / 8000 - offset.x / 8000,
    lat: -(cy - h / 2) / zoom / 8000 + offset.y / 8000,
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, offset: { x: number; y: number }, zoom: number) {
  const spacing = 40 * zoom;
  const ox = ((w / 2 + offset.x * zoom) % spacing + spacing) % spacing;
  const oy = ((h / 2 + offset.y * zoom) % spacing + spacing) % spacing;

  ctx.strokeStyle = "rgba(100,116,139,0.1)";
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

function generateGridLines(
  points: { x: number; y: number }[],
  pattern: string,
): { x: number; y: number }[][] {
  if (points.length < 3) return [];

  // Bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const lines: { x: number; y: number }[][] = [];
  const spacing = 30;

  // Horizontal lines
  for (let y = minY; y <= maxY; y += spacing) {
    lines.push([{ x: minX, y }, { x: maxX, y }]);
  }

  if (pattern === "Double Grid") {
    for (let x = minX; x <= maxX; x += spacing) {
      lines.push([{ x, y: minY }, { x, y: maxY }]);
    }
  }

  return lines;
}

export default function FlightPlanner() {
  const [missionName, setMissionName] = useState("Survey Mission 1");
  const [altitude, setAltitude] = useState(60);
  const [speed, setSpeed] = useState(5);
  const [interval, setInterval] = useState("2");
  const [frontOverlap, setFrontOverlap] = useState(70);
  const [sideOverlap, setSideOverlap] = useState(65);
  const [pattern, setPattern] = useState<string>("Grid");
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [hoverCoord, setHoverCoord] = useState<Waypoint | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const stateRef = useRef<CanvasState>({
    offset: { x: 0, y: 0 },
    zoom: 1,
    dragging: false,
    dragStart: { x: 0, y: 0 },
  });

  // Resize
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

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = { w: canvas.width, h: canvas.height };
    const { offset, zoom } = stateRef.current;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h, offset, zoom);

    // Convert waypoints to canvas coords
    const pts = waypoints.map((wp) => worldToCanvas(wp, w, h, offset, zoom));

    // Draw polygon fill
    if (pts.length >= 3) {
      ctx.fillStyle = "rgba(45,212,191,0.06)";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();

      // Grid lines
      if (pattern === "Grid" || pattern === "Double Grid") {
        const gridLines = generateGridLines(pts, pattern);
        ctx.strokeStyle = "rgba(94,234,212,0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        for (const line of gridLines) {
          ctx.beginPath();
          ctx.moveTo(line[0].x, line[0].y);
          ctx.lineTo(line[1].x, line[1].y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }

    // Lines between waypoints
    if (pts.length >= 2) {
      ctx.strokeStyle = "rgba(45,212,191,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (pts.length >= 3) ctx.closePath();
      ctx.stroke();
    }

    // Waypoint markers
    pts.forEach((p, i) => {
      // Outer ring
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(45,212,191,0.2)";
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#2dd4bf";
      ctx.fill();

      // Number label
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), p.x, p.y - 18);
    });

    // Total distance
    if (pts.length >= 2) {
      let totalDist = 0;
      for (let i = 1; i < pts.length; i++) {
        totalDist += dist(pts[i - 1], pts[i]);
      }
      if (pts.length >= 3) totalDist += dist(pts[pts.length - 1], pts[0]);

      ctx.fillStyle = "rgba(148,163,184,0.7)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`Total: ${(totalDist / zoom * 0.5).toFixed(0)}m`, 12, h - 12);
    }

    // "Click to add" hint
    if (waypoints.length === 0) {
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Click on the map to add waypoints", w / 2, h / 2);
    }

    animRef.current = requestAnimationFrame(render);
  }, [waypoints, pattern]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [render]);

  // Mouse handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        stateRef.current.dragging = true;
        stateRef.current.dragStart = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const { offset, zoom } = stateRef.current;

      setHoverCoord(canvasToWorld(cx, cy, canvas.width, canvas.height, offset, zoom));

      if (stateRef.current.dragging) {
        const dx = e.clientX - stateRef.current.dragStart.x;
        const dy = e.clientY - stateRef.current.dragStart.y;
        stateRef.current.offset = {
          x: stateRef.current.offset.x + dx / stateRef.current.zoom,
          y: stateRef.current.offset.y + dy / stateRef.current.zoom,
        };
        stateRef.current.dragStart = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (stateRef.current.dragging) {
        stateRef.current.dragging = false;
        return;
      }

      if (e.button !== 0 || e.shiftKey) return;

      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const { offset, zoom } = stateRef.current;

      // Check if clicking near existing waypoint (to delete)
      const pts = waypoints.map((wp) => worldToCanvas(wp, canvas.width, canvas.height, offset, zoom));
      for (let i = 0; i < pts.length; i++) {
        if (dist(pts[i], { x: cx, y: cy }) < 15) {
          if (confirm(`Delete waypoint ${i + 1}?`)) {
            setWaypoints((prev) => prev.filter((_, idx) => idx !== i));
          }
          return;
        }
      }

      // Add new waypoint
      const wp = canvasToWorld(cx, cy, canvas.width, canvas.height, offset, zoom);
      setWaypoints((prev) => [...prev, wp]);
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      stateRef.current.zoom = Math.max(0.3, Math.min(5, stateRef.current.zoom * delta));
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [waypoints]);

  // Estimated stats
  const totalDistM = (() => {
    if (waypoints.length < 2) return 0;
    let d = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const dlat = (waypoints[i].lat - waypoints[i - 1].lat) * 111320;
      const dlng = (waypoints[i].lng - waypoints[i - 1].lng) * 111320 * Math.cos((waypoints[0].lat * Math.PI) / 180);
      d += Math.sqrt(dlat ** 2 + dlng ** 2);
    }
    return d;
  })();

  const estFlightTime = totalDistM / speed;
  const estPhotos = Math.max(0, Math.floor(estFlightTime / Number(interval)));
  const coverageArea = waypoints.length >= 3
    ? Math.abs(totalDistM * altitude * 0.001 * (1 - sideOverlap / 100))
    : 0;

  const handleClear = () => {
    setWaypoints([]);
  };

  const handleSave = () => {
    alert(`Mission "${missionName}" saved with ${waypoints.length} waypoints`);
  };

  const handleExportKML = () => {
    if (waypoints.length === 0) return;
    let kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>${missionName}</name>\n<Placemark>\n<name>Flight Path</name>\n<LineString>\n<altitudeMode>relativeToGround</altitudeMode>\n<coordinates>\n`;
    for (const wp of waypoints) {
      kml += `${wp.lng},${wp.lat},${altitude}\n`;
    }
    kml += `</coordinates>\n</LineString>\n</Placemark>\n</Document>\n</kml>`;

    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${missionName.replace(/\s+/g, "_")}.kml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex" data-testid="flight-planner-page">
      {/* Left panel */}
      <div className="w-80 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-background overflow-y-auto p-4 space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-page-title">
            Flight Planner
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Plan survey routes and export missions
          </p>
        </div>

        {/* Mission name */}
        <div className="space-y-1.5">
          <Label>Mission Name</Label>
          <Input
            value={missionName}
            onChange={(e) => setMissionName(e.target.value)}
            data-testid="input-mission-name"
          />
        </div>

        {/* Altitude */}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label>Altitude</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{altitude}m</span>
          </div>
          <Slider
            min={30}
            max={120}
            step={5}
            value={[altitude]}
            onValueChange={([v]) => setAltitude(v)}
            data-testid="slider-altitude"
          />
        </div>

        {/* Speed */}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label>Speed</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{speed} m/s</span>
          </div>
          <Slider
            min={1}
            max={15}
            step={1}
            value={[speed]}
            onValueChange={([v]) => setSpeed(v)}
            data-testid="slider-speed"
          />
        </div>

        {/* Camera interval */}
        <div className="space-y-1.5">
          <Label>Camera Interval</Label>
          <Select value={interval} onValueChange={setInterval}>
            <SelectTrigger data-testid="select-interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((v) => (
                <SelectItem key={v} value={v}>{v}s</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Overlap */}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label>Front Overlap</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{frontOverlap}%</span>
          </div>
          <Slider
            min={30}
            max={90}
            step={5}
            value={[frontOverlap]}
            onValueChange={([v]) => setFrontOverlap(v)}
            data-testid="slider-front-overlap"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label>Side Overlap</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{sideOverlap}%</span>
          </div>
          <Slider
            min={30}
            max={90}
            step={5}
            value={[sideOverlap]}
            onValueChange={([v]) => setSideOverlap(v)}
            data-testid="slider-side-overlap"
          />
        </div>

        {/* Pattern */}
        <div className="space-y-1.5">
          <Label>Pattern Type</Label>
          <Select value={pattern} onValueChange={setPattern}>
            <SelectTrigger data-testid="select-pattern">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PATTERNS.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estimated stats */}
        <Card className="p-3 bg-muted/50" data-testid="card-estimates">
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Estimates</div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" /> Flight time
              </span>
              <span className="tabular-nums">{Math.floor(estFlightTime / 60)}m {Math.floor(estFlightTime % 60)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Ruler className="w-3.5 h-3.5" /> Distance
              </span>
              <span className="tabular-nums">{totalDistM.toFixed(0)}m</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Camera className="w-3.5 h-3.5" /> Photos
              </span>
              <span className="tabular-nums">{estPhotos}</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Grid3X3 className="w-3.5 h-3.5" /> Coverage
              </span>
              <span className="tabular-nums">{(coverageArea / 10000).toFixed(2)} ha</span>
            </div>
          </div>
        </Card>

        {/* Waypoints count */}
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-teal-500" />
            {waypoints.length} waypoints
          </span>
          {waypoints.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClear} data-testid="button-clear-waypoints">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear All
            </Button>
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          <Button className="w-full" onClick={handleSave} data-testid="button-save-mission">
            <Save className="w-4 h-4 mr-2" /> Save Mission
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleExportKML}
            disabled={waypoints.length === 0}
            data-testid="button-export-kml"
          >
            <Download className="w-4 h-4 mr-2" /> Export KML
          </Button>
        </div>
      </div>

      {/* Map canvas */}
      <div ref={containerRef} className="flex-1 relative bg-slate-900 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={size.w}
          height={size.h}
          className="absolute inset-0 cursor-crosshair"
          data-testid="canvas-planner"
        />

        {/* Hover coordinate display */}
        {hoverCoord && (
          <div className="absolute bottom-3 right-3 bg-slate-800/80 text-slate-300 text-xs px-2 py-1 rounded tabular-nums backdrop-blur-sm">
            {hoverCoord.lat.toFixed(6)}, {hoverCoord.lng.toFixed(6)}
          </div>
        )}

        {/* Instructions */}
        <div className="absolute top-3 left-3 text-xs text-slate-500">
          Click to add waypoints · Click waypoint to delete · Shift+drag to pan · Scroll to zoom
        </div>
      </div>
    </div>
  );
}
