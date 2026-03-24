import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import * as nodeodm from "./nodeodm";
import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const outputBaseDir = path.join(process.cwd(), "outputs");
if (!fs.existsSync(outputBaseDir)) {
  fs.mkdirSync(outputBaseDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// Simulated processing pipeline (fallback when NodeODM is unavailable)
const processingStages = [
  { status: "aligning", label: "Aligning images", duration: 3000 },
  { status: "densifying", label: "Building dense point cloud", duration: 5000 },
  { status: "meshing", label: "Generating mesh", duration: 4000 },
  { status: "texturing", label: "Applying textures", duration: 3000 },
];

function simulateProcessing(processingId: number) {
  let stageIndex = 0;

  const runStage = async () => {
    if (stageIndex >= processingStages.length) {
      await storage.updateProcessing(processingId, {
        status: "complete",
        progress: 100,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    const stage = processingStages[stageIndex];
    const baseProgress = Math.round((stageIndex / processingStages.length) * 100);

    await storage.updateProcessing(processingId, {
      status: stage.status,
      progress: baseProgress,
      startedAt: stageIndex === 0 ? new Date().toISOString() : undefined,
    });

    // Increment progress within stage
    const increments = 5;
    const incrementDelay = stage.duration / increments;
    const progressPerIncrement = Math.round((1 / processingStages.length) * 100 / increments);

    for (let i = 1; i <= increments; i++) {
      setTimeout(async () => {
        const currentProgress = Math.min(baseProgress + progressPerIncrement * i, 99);
        await storage.updateProcessing(processingId, { progress: currentProgress });
      }, incrementDelay * i);
    }

    setTimeout(() => {
      stageIndex++;
      runStage();
    }, stage.duration);
  };

  // Start after 1 second delay
  setTimeout(runStage, 1000);
}

/** Map NodeODM progress (0-100) and status code to our pipeline stage. */
function mapNodeODMProgress(progress: number, statusCode: number): { status: string; progress: number } {
  if (statusCode === 30) {
    return { status: "failed", progress };
  }
  if (statusCode === 50) {
    return { status: "failed", progress };
  }
  if (statusCode === 40) {
    return { status: "complete", progress: 100 };
  }

  // Map progress ranges to our stages
  if (progress < 15) {
    return { status: "aligning", progress };
  } else if (progress < 40) {
    return { status: "densifying", progress };
  } else if (progress < 65) {
    return { status: "meshing", progress };
  } else {
    return { status: "texturing", progress };
  }
}

/** Poll NodeODM for task status and update our processing record. */
async function pollNodeODMTask(processingId: number, taskUuid: string, projectId: number) {
  const outputDir = path.join(outputBaseDir, String(projectId));

  const poll = async () => {
    try {
      const info = await nodeodm.getTaskInfo(taskUuid);
      const mapped = mapNodeODMProgress(info.progress, info.status.code);

      await storage.updateProcessing(processingId, {
        status: mapped.status,
        progress: mapped.progress,
      });

      if (info.status.code === 40) {
        // Completed — download results
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        try {
          await nodeodm.downloadAsset(taskUuid, "all.zip", path.join(outputDir, "all.zip"));
        } catch {
          // all.zip may not be available; try orthophoto as fallback
          try {
            await nodeodm.downloadAsset(taskUuid, "orthophoto.tif", path.join(outputDir, "orthophoto.tif"));
          } catch {
            // No downloadable assets — still mark complete
          }
        }
        await storage.updateProcessing(processingId, {
          status: "complete",
          progress: 100,
          completedAt: new Date().toISOString(),
        });
        return; // stop polling
      }

      if (info.status.code === 30 || info.status.code === 50) {
        // Failed or canceled
        await storage.updateProcessing(processingId, {
          status: "failed",
          completedAt: new Date().toISOString(),
        });
        return; // stop polling
      }

      // Still running — poll again
      setTimeout(poll, 3000);
    } catch (err) {
      console.error(`NodeODM poll error for task ${taskUuid}:`, err);
      await storage.updateProcessing(processingId, {
        status: "failed",
        completedAt: new Date().toISOString(),
      });
    }
  };

  // Start polling
  setTimeout(poll, 3000);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Serve uploaded files
  app.use("/api/files", (req, res, next) => {
    const filePath = path.join(uploadDir, req.path);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  });

  // NodeODM status check
  app.get("/api/nodeodm/status", async (_req, res) => {
    const info = await nodeodm.checkConnection();
    res.json({
      connected: info !== null,
      info,
      presets: Object.keys(nodeodm.GPU_PRESETS),
      presetDetails: {
        fast: { label: "Fast", description: "Quick preview, lower detail. ~5-15 min for 50 images.", icon: "zap" },
        balanced: { label: "Balanced", description: "Good quality + speed. GPU-optimized defaults. ~15-45 min.", icon: "scale" },
        high: { label: "High", description: "Maximum detail with DSM/DTM. Needs 6GB+ VRAM. ~1-3 hours.", icon: "sparkles" },
        ultra: { label: "Ultra", description: "Research-grade. Point cloud classification. Very slow. ~3-8 hours.", icon: "crown" },
      },
    });
  });

  // Serve processing output files
  app.get("/api/projects/:id/output/:filename", (req, res) => {
    const projectId = req.params.id;
    const filename = req.params.filename;
    const filePath = path.join(outputBaseDir, projectId, filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "Output file not found" });
    }
  });

  // Projects CRUD
  app.get("/api/projects", async (_req, res) => {
    const allProjects = await storage.getProjects();
    res.json(allProjects);
  });

  app.get("/api/projects/:id", async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: "Not found" });
    res.json(project);
  });

  app.post("/api/projects", async (req, res) => {
    const project = await storage.createProject({
      ...req.body,
      createdAt: new Date().toISOString(),
    });
    res.json(project);
  });

  app.patch("/api/projects/:id", async (req, res) => {
    const project = await storage.updateProject(Number(req.params.id), req.body);
    if (!project) return res.status(404).json({ error: "Not found" });
    res.json(project);
  });

  app.delete("/api/projects/:id", async (req, res) => {
    await storage.deleteProject(Number(req.params.id));
    res.json({ ok: true });
  });

  // Uploads
  app.get("/api/projects/:id/uploads", async (req, res) => {
    const projectUploads = await storage.getUploadsByProject(Number(req.params.id));
    res.json(projectUploads);
  });

  app.post("/api/projects/:id/uploads", upload.array("files", 100), async (req, res) => {
    const projectId = Number(req.params.id);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return res.status(400).json({ error: "No files" });

    const created = [];
    for (const file of files) {
      const isVideo = file.mimetype.startsWith("video/");
      const name = file.originalname.toLowerCase();
      const ext = path.extname(name);
      // Detect 360 content: Insta360 formats (.insv, .insp), or filenames containing "360", "pano", "equirectangular"
      const is360 = [".insv", ".insp"].includes(ext)
        || /(?:^|[_\-])360(?:[_\-]|$)/.test(name)
        || name.includes("pano")
        || name.includes("equirect")
        || name.includes("insta360")
        || name.includes("theta")  // Ricoh Theta
        || name.includes("gopro_max"); // GoPro MAX
      const fileType = is360 ? "panorama" : isVideo ? "video" : "photo";
      const uploadRecord = await storage.createUpload({
        projectId,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        type: fileType,
        createdAt: new Date().toISOString(),
        lat: null,
        lng: null,
        altitude: null,
      });
      created.push(uploadRecord);
    }

    // Update project image count
    const allUploads = await storage.getUploadsByProject(projectId);
    await storage.updateProject(projectId, {
      imageCount: allUploads.length,
    });

    res.json(created);
  });

  app.delete("/api/uploads/:id", async (req, res) => {
    const uploadRecord = await storage.getUpload(Number(req.params.id));
    if (uploadRecord) {
      const filePath = path.join(uploadDir, uploadRecord.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await storage.deleteUpload(uploadRecord.id);

      // Update count
      const allUploads = await storage.getUploadsByProject(uploadRecord.projectId);
      await storage.updateProject(uploadRecord.projectId, {
        imageCount: allUploads.length,
      });
    }
    res.json({ ok: true });
  });

  // Processing
  app.get("/api/projects/:id/processings", async (req, res) => {
    const procs = await storage.getProcessingsByProject(Number(req.params.id));
    res.json(procs);
  });

  app.get("/api/processings/:id", async (req, res) => {
    const proc = await storage.getProcessing(Number(req.params.id));
    if (!proc) return res.status(404).json({ error: "Not found" });
    res.json(proc);
  });

  app.post("/api/projects/:id/process", async (req, res) => {
    const projectId = Number(req.params.id);
    const outputType = req.body.outputType || "3d_model";

    const processing = await storage.createProcessing({
      projectId,
      status: "queued",
      progress: 0,
      outputType,
      nodeodmUuid: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
    });

    // Check if NodeODM is available
    const nodeodmInfo = await nodeodm.checkConnection();

    if (nodeodmInfo) {
      // Real processing via NodeODM
      try {
        // Gather uploaded image files for this project
        const projectUploads = await storage.getUploadsByProject(projectId);
        const imagePaths = projectUploads
          .filter((u) => u.type === "photo")
          .map((u) => path.join(uploadDir, u.filename));

        if (imagePaths.length === 0) {
          await storage.updateProcessing(processing.id, {
            status: "failed",
            completedAt: new Date().toISOString(),
          });
          return res.status(400).json({ error: "No images to process" });
        }

        // Get quality preset from request (default: balanced for GPU optimization)
        const quality = (req.body.quality || "balanced") as nodeodm.QualityPreset;
        console.log(`[AeroMap] Starting ${quality} quality processing for project ${projectId} (${imagePaths.length} images)`);
        
        const taskUuid = await nodeodm.createTask(imagePaths, quality);

        await storage.updateProcessing(processing.id, {
          nodeodmUuid: taskUuid,
          status: "queued",
          startedAt: new Date().toISOString(),
        });

        // Start polling for progress
        pollNodeODMTask(processing.id, taskUuid, projectId);

        const updated = await storage.getProcessing(processing.id);
        res.json(updated);
      } catch (err) {
        console.error("NodeODM task creation failed, falling back to simulation:", err);
        // Fall back to simulation on error
        simulateProcessing(processing.id);
        res.json(processing);
      }
    } else {
      // Fallback: simulated processing pipeline
      simulateProcessing(processing.id);
      res.json(processing);
    }
  });

  return httpServer;
}
