import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, API_BASE } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import type { Project, Upload, Processing } from "@shared/schema";
import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import {
  ArrowLeft,
  Upload as UploadIcon,
  Image,
  Video,
  Trash2,
  Play,
  Box,
  Map,
  Layers,
  FileImage,
  Globe,
  ChevronRight,
  Check,
  Loader2,
  X,
  Eye,
  Zap,
  Scale,
  Sparkles,
  Crown,
  ChevronDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModelViewer } from "@/components/model-viewer";
import { MapViewer } from "@/components/map-viewer";

const processStages = ["queued", "aligning", "densifying", "meshing", "texturing", "complete"];
const stageLabels: Record<string, string> = {
  queued: "Queued",
  aligning: "Aligning Images",
  densifying: "Dense Point Cloud",
  meshing: "Generating Mesh",
  texturing: "Applying Textures",
  complete: "Complete",
  failed: "Failed",
};

interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export default function ProjectView() {
  const [, params] = useRoute("/projects/:id");
  const projectId = Number(params?.id);
  const [activeTab, setActiveTab] = useState("uploads");
  const [showViewer, setShowViewer] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [quality, setQuality] = useState<string>("balanced");
  const { toast } = useToast();
  const pollingRef = useRef<ReturnType<typeof setInterval>>();

  const { data: project, isLoading: loadingProject } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
  });

  const { data: uploads, isLoading: loadingUploads } = useQuery<Upload[]>({
    queryKey: ["/api/projects", projectId, "uploads"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/uploads`);
      return res.json();
    },
  });

  const { data: processings } = useQuery<Processing[]>({
    queryKey: ["/api/projects", projectId, "processings"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/processings`);
      return res.json();
    },
  });

  // Poll for processing updates
  const activeProcessing = processings?.find(
    (p) => p.status !== "complete" && p.status !== "failed"
  );

  useEffect(() => {
    if (activeProcessing) {
      pollingRef.current = setInterval(() => {
        queryClient.invalidateQueries({
          queryKey: ["/api/projects", projectId, "processings"],
        });
      }, 2000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeProcessing, projectId]);

  // Check NodeODM status
  const { data: nodeodmStatus } = useQuery<{ connected: boolean; info: any }>({
    queryKey: ["/api/nodeodm/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/nodeodm/status");
      return res.json();
    },
    staleTime: 30000,
  });

  // Upload mutation with XHR progress tracking
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      return new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/api/projects/${projectId}/uploads`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress({
              loaded: e.loaded,
              total: e.total,
              percent: Math.round((e.loaded / e.total) * 100),
            });
          }
        };
        xhr.onload = () => {
          setUploadProgress(null);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => {
          setUploadProgress(null);
          reject(new Error("Upload failed"));
        };
        xhr.send(formData);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Files uploaded" });
    },
    onError: () => {
      setUploadProgress(null);
      toast({ title: "Upload failed", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/uploads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ outputType, quality: q }: { outputType: string; quality: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/process`, { outputType, quality: q });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "processings"] });
      setActiveTab("processing");
      toast({ title: "Processing started" });
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      uploadMutation.mutate(acceptedFiles);
    },
    [uploadMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpg", ".jpeg", ".png", ".tiff", ".tif", ".dng", ".raw"],
      "video/*": [".mp4", ".mov", ".avi", ".mkv", ".webm"],
      "application/octet-stream": [".insv", ".insp"],
    },
  });

  const photos = uploads?.filter((u) => u.type === "photo") ?? [];
  const videos = uploads?.filter((u) => u.type === "video") ?? [];
  const panoramas = uploads?.filter((u) => u.type === "panorama") ?? [];
  const completedProcessing = processings?.find((p) => p.status === "complete");

  if (loadingProject) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-4 w-32 mb-8" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center py-20">
        <p className="text-muted-foreground">Project not found</p>
        <Link href="/">
          <Button variant="outline" className="mt-4">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 3D Viewer overlay */}
      {showViewer && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowViewer(false)}
              className="bg-background/80 backdrop-blur"
              data-testid="button-close-viewer"
            >
              <X className="w-4 h-4 mr-1" /> Close
            </Button>
            <Badge variant="secondary" className="bg-background/80 backdrop-blur">
              3D Model Viewer
            </Badge>
          </div>
          <ModelViewer projectId={projectId} hasRealOutput={!!completedProcessing} />
        </div>
      )}

      {/* Header */}
      <div className="border-b px-6 py-4 shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/">
            <button className="p-1.5 rounded-lg hover:bg-accent transition-colors" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Projects</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground font-medium">{project.name}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-project-title">
              {project.name}
            </h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-sm text-muted-foreground">
                {project.location || "No location"} &middot; {project.imageCount} files
              </p>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${nodeodmStatus?.connected ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="text-xs text-muted-foreground">
                  {nodeodmStatus?.connected ? "NodeODM Connected" : "Simulation Mode"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {completedProcessing && (
              <Button
                onClick={() => setShowViewer(true)}
                variant="outline"
                data-testid="button-view-3d"
              >
                <Eye className="w-4 h-4 mr-2" />
                View 3D Model
              </Button>
            )}
            {/* Quality selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-quality">
                  {quality === "fast" && <Zap className="w-3.5 h-3.5" />}
                  {quality === "balanced" && <Scale className="w-3.5 h-3.5" />}
                  {quality === "high" && <Sparkles className="w-3.5 h-3.5" />}
                  {quality === "ultra" && <Crown className="w-3.5 h-3.5" />}
                  {quality.charAt(0).toUpperCase() + quality.slice(1)}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => setQuality("fast")} className="flex-col items-start gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium text-sm"><Zap className="w-3.5 h-3.5" /> Fast</span>
                  <span className="text-xs text-muted-foreground">Quick preview. ~5-15 min for 50 images</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setQuality("balanced")} className="flex-col items-start gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium text-sm"><Scale className="w-3.5 h-3.5" /> Balanced</span>
                  <span className="text-xs text-muted-foreground">GPU-optimized defaults. ~15-45 min</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setQuality("high")} className="flex-col items-start gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium text-sm"><Sparkles className="w-3.5 h-3.5" /> High</span>
                  <span className="text-xs text-muted-foreground">Max detail + DSM/DTM. 6GB+ VRAM. ~1-3 hrs</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setQuality("ultra")} className="flex-col items-start gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium text-sm"><Crown className="w-3.5 h-3.5" /> Ultra</span>
                  <span className="text-xs text-muted-foreground">Research-grade. Point cloud classify. ~3-8 hrs</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => processMutation.mutate({ outputType: "3d_model", quality })}
              disabled={!uploads?.length || !!activeProcessing || processMutation.isPending}
              data-testid="button-process"
            >
              {activeProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Box className="w-4 h-4 mr-2" />
                  Process
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="p-6 max-w-[1400px] mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-5">
              <TabsTrigger value="uploads" data-testid="tab-uploads">
                <UploadIcon className="w-4 h-4 mr-2" />
                Uploads
                {uploads && <Badge variant="secondary" className="ml-2 text-xs">{uploads.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="processing" data-testid="tab-processing">
                <Layers className="w-4 h-4 mr-2" />
                Processing
              </TabsTrigger>
              <TabsTrigger value="map" data-testid="tab-map">
                <Map className="w-4 h-4 mr-2" />
                Map
              </TabsTrigger>
              <TabsTrigger value="model" data-testid="tab-model">
                <Box className="w-4 h-4 mr-2" />
                3D Model
              </TabsTrigger>
            </TabsList>

            {/* Uploads Tab */}
            <TabsContent value="uploads">
              {/* Drop zone */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer mb-6 ${
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-accent/30"
                }`}
                data-testid="dropzone"
              >
                <input {...getInputProps()} data-testid="input-file-upload" />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <UploadIcon className="w-6 h-6 text-primary" />
                  </div>
                  {uploadMutation.isPending || uploadProgress ? (
                    <div className="w-full max-w-sm">
                      <p className="font-medium text-sm text-center mb-2">Uploading...</p>
                      <Progress value={uploadProgress?.percent ?? 0} className="h-2 mb-1.5" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{uploadProgress?.percent ?? 0}%</span>
                        <span>
                          {uploadProgress
                            ? `${(uploadProgress.loaded / (1024 * 1024)).toFixed(1)} / ${(uploadProgress.total / (1024 * 1024)).toFixed(1)} MB`
                            : "Preparing..."}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium text-sm">
                        {isDragActive ? "Drop files here" : "Drag photos, videos & 360° footage here"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        JPG, PNG, TIFF, DNG, RAW, MP4, MOV, INSV, INSP — or click to browse
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* File grid */}
              {loadingUploads && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="aspect-square rounded-lg" />
                  ))}
                </div>
              )}

              {!loadingUploads && uploads && uploads.length > 0 && (
                <>
                  {/* Stats */}
                  <div className="flex items-center gap-4 mb-4 text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Image className="w-4 h-4" />
                      {photos.length} photos
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Video className="w-4 h-4" />
                      {videos.length} videos
                    </span>
                    {panoramas.length > 0 && (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Globe className="w-4 h-4" />
                        {panoramas.length} 360°
                      </span>
                    )}
                    <span className="text-muted-foreground tabular-nums">
                      {(uploads.reduce((a, u) => a + u.size, 0) / (1024 * 1024)).toFixed(1)} MB total
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {uploads.map((upload) => (
                      <div
                        key={upload.id}
                        className="group relative aspect-square rounded-lg overflow-hidden bg-muted border"
                        data-testid={`card-upload-${upload.id}`}
                      >
                        {upload.type === "photo" || upload.type === "panorama" ? (
                          <img
                            src={`${API_BASE}/api/files/${upload.filename}`}
                            alt={upload.originalName}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <div className="text-center">
                              <Play className="w-8 h-8 text-muted-foreground mx-auto" />
                              <p className="text-xs text-muted-foreground mt-1 truncate px-2">
                                {upload.originalName}
                              </p>
                            </div>
                          </div>
                        )}
                        {/* Overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                          <div className="w-full p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-white truncate max-w-[80%]">
                                {upload.originalName}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteMutation.mutate(upload.id);
                                }}
                                className="p-1 rounded hover:bg-white/20"
                                data-testid={`button-delete-upload-${upload.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-white" />
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Type badge */}
                        <div className="absolute top-2 left-2">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-black/50 text-white border-0">
                            {upload.type === "panorama" ? (
                              <><Globe className="w-3 h-3 mr-0.5" /> 360°</>
                            ) : upload.type === "photo" ? (
                              <><FileImage className="w-3 h-3 mr-0.5" /> Photo</>
                            ) : (
                              <><Video className="w-3 h-3 mr-0.5" /> Video</>
                            )}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!loadingUploads && (!uploads || uploads.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  <FileImage className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No files uploaded</p>
                  <p className="text-xs mt-1">Drop drone photos and videos above to get started</p>
                </div>
              )}
            </TabsContent>

            {/* Processing Tab */}
            <TabsContent value="processing">
              {(!processings || processings.length === 0) && (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <Layers className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium mb-1">No processing jobs yet</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Upload images and click "Process" to generate 3D models
                  </p>
                </div>
              )}

              {processings && processings.length > 0 && (
                <div className="space-y-4">
                  {processings.map((proc) => (
                    <Card key={proc.id} className="p-5" data-testid={`card-processing-${proc.id}`}>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-medium text-sm">
                            {proc.outputType === "3d_model" ? "3D Model" : proc.outputType === "orthomosaic" ? "Orthomosaic" : "Point Cloud"}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Started {proc.startedAt ? new Date(proc.startedAt).toLocaleString() : "pending"}
                          </p>
                        </div>
                        {proc.status === "complete" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <Check className="w-3 h-3 mr-1" /> Complete
                          </Badge>
                        ) : proc.status === "failed" ? (
                          <Badge variant="destructive">Failed</Badge>
                        ) : (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse-glow">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            {stageLabels[proc.status] || proc.status}
                          </Badge>
                        )}
                      </div>

                      {/* Progress bar */}
                      <Progress value={proc.progress} className="h-2 mb-4" />

                      {/* Pipeline stages */}
                      <div className="flex items-center gap-1">
                        {processStages.map((stage, idx) => {
                          const currentIdx = processStages.indexOf(proc.status);
                          const isComplete = idx < currentIdx || proc.status === "complete";
                          const isCurrent = stage === proc.status;
                          return (
                            <div key={stage} className="flex items-center gap-1 flex-1">
                              <div
                                className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-medium shrink-0 ${
                                  isComplete
                                    ? "bg-emerald-500 text-white"
                                    : isCurrent
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {isComplete ? <Check className="w-3 h-3" /> : idx + 1}
                              </div>
                              {idx < processStages.length - 1 && (
                                <div
                                  className={`h-0.5 flex-1 rounded ${
                                    isComplete ? "bg-emerald-500" : "bg-muted"
                                  }`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between mt-1.5">
                        {processStages.map((stage) => (
                          <span key={stage} className="text-[10px] text-muted-foreground">
                            {stageLabels[stage]}
                          </span>
                        ))}
                      </div>

                      {/* View button for completed */}
                      {proc.status === "complete" && (
                        <div className="mt-4 pt-4 border-t">
                          <Button
                            size="sm"
                            onClick={() => setShowViewer(true)}
                            data-testid={`button-view-result-${proc.id}`}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Result
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Map Tab */}
            <TabsContent value="map">
              <Card className="overflow-hidden" style={{ height: "500px" }}>
                <MapViewer uploads={uploads || []} project={project} />
              </Card>
            </TabsContent>

            {/* 3D Model Tab */}
            <TabsContent value="model">
              {completedProcessing ? (
                <Card className="overflow-hidden" style={{ height: "500px" }}>
                  <ModelViewer projectId={projectId} hasRealOutput={!!completedProcessing} />
                </Card>
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <Box className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium mb-1">No 3D model available</p>
                  <p className="text-xs text-muted-foreground">
                    {activeProcessing
                      ? "Processing in progress..."
                      : "Upload images and run processing to generate a 3D model"}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
