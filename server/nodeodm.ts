import fs from "fs";
import path from "path";

const NODEODM_URL = process.env.NODEODM_URL || "http://localhost:3000";

export interface NodeODMInfo {
  version: string;
  taskQueueCount: number;
  maxParallelTasks: number;
  engineVersion: string;
  engine: string;
}

/** GPU-optimized processing presets for NVIDIA cards */
export const GPU_PRESETS = {
  // Fast: prioritizes speed. Good for quick previews.
  fast: {
    "feature-quality": "medium",
    "pc-quality": "low",
    "mesh-octree-depth": 9,
    "mesh-size": 100000,
    "fast-orthophoto": true,
    "auto-boundary": true,
    "max-concurrency": 8,
    "depthmap-resolution": 640,
  },
  // Balanced: good quality with reasonable processing time. Best default.
  balanced: {
    "feature-quality": "high",
    "pc-quality": "medium",
    "mesh-octree-depth": 11,
    "mesh-size": 200000,
    "dsm": true,
    "auto-boundary": true,
    "max-concurrency": 8,
  },
  // High quality: maximum detail, uses more GPU memory and time.
  high: {
    "feature-quality": "ultra",
    "pc-quality": "high",
    "mesh-octree-depth": 12,
    "mesh-size": 300000,
    "dsm": true,
    "dtm": true,
    "auto-boundary": true,
    "use-3dmesh": true,
    "max-concurrency": 4,  // lower concurrency to avoid OOM on large datasets
  },
  // Ultra: research-grade output. Very slow, very detailed.
  ultra: {
    "feature-quality": "ultra",
    "pc-quality": "ultra",
    "mesh-octree-depth": 13,
    "mesh-size": 500000,
    "dsm": true,
    "dtm": true,
    "auto-boundary": true,
    "use-3dmesh": true,
    "pc-classify": true,
    "max-concurrency": 2,  // minimize concurrency for peak quality
    "dem-resolution": 2,
  },
} as const;

export type QualityPreset = keyof typeof GPU_PRESETS;

export interface NodeODMTaskInfo {
  uuid: string;
  status: { code: number }; // 10=queued, 20=running, 30=failed, 40=completed, 50=canceled
  processingTime: number;
  progress: number; // 0-100
  imagesCount: number;
  output: string[];
  dateCreated: string;
}

/** Ping the NodeODM server and return info, or null if unreachable. */
export async function checkConnection(): Promise<NodeODMInfo | null> {
  try {
    const res = await fetch(`${NODEODM_URL}/info`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()) as NodeODMInfo;
  } catch {
    return null;
  }
}

/** Upload images to NodeODM and create a processing task. Returns the task UUID. */
export async function createTask(
  imagePaths: string[],
  quality: QualityPreset = "balanced",
  extraOptions?: Record<string, any>,
): Promise<string> {
  const formData = new FormData();

  for (const imgPath of imagePaths) {
    const buf = fs.readFileSync(imgPath);
    const blob = new Blob([buf]);
    formData.append("images", blob, path.basename(imgPath));
  }

  // Merge GPU preset with any extra options
  const preset = GPU_PRESETS[quality] || GPU_PRESETS.balanced;
  const options = { ...preset, ...extraOptions };
  
  // Convert options to NodeODM format (array of {name, value} objects)
  const odmOptions = Object.entries(options).map(([name, value]) => ({ name, value }));
  formData.append("options", JSON.stringify(odmOptions));

  const res = await fetch(`${NODEODM_URL}/task/new`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NodeODM createTask failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { uuid: string };
  return data.uuid;
}

/** Get task info including progress and status. */
export async function getTaskInfo(uuid: string): Promise<NodeODMTaskInfo> {
  const res = await fetch(`${NODEODM_URL}/task/${uuid}/info`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NodeODM getTaskInfo failed (${res.status}): ${text}`);
  }
  return (await res.json()) as NodeODMTaskInfo;
}

/** Get console output lines. Pass line to get only lines after that index. */
export async function getTaskOutput(uuid: string, line?: number): Promise<string[]> {
  const url = line !== undefined
    ? `${NODEODM_URL}/task/${uuid}/output?line=${line}`
    : `${NODEODM_URL}/task/${uuid}/output`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NodeODM getTaskOutput failed (${res.status}): ${text}`);
  }
  return (await res.json()) as string[];
}

/** Download a result asset (e.g. "all.zip", "orthophoto.tif") to a local path. */
export async function downloadAsset(
  uuid: string,
  asset: string,
  destPath: string,
): Promise<void> {
  const res = await fetch(`${NODEODM_URL}/task/${uuid}/download/${asset}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NodeODM downloadAsset failed (${res.status}): ${text}`);
  }

  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const arrayBuf = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuf));
}

/** Cancel a running task. */
export async function cancelTask(uuid: string): Promise<void> {
  const res = await fetch(`${NODEODM_URL}/task/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NodeODM cancelTask failed (${res.status}): ${text}`);
  }
}

/** Remove a task and its data from the server. */
export async function removeTask(uuid: string): Promise<void> {
  const res = await fetch(`${NODEODM_URL}/task/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NodeODM removeTask failed (${res.status}): ${text}`);
  }
}
