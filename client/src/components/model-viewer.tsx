import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { API_BASE } from "@/lib/queryClient";

interface ModelViewerProps {
  projectId?: number;
  hasRealOutput?: boolean;
}

export function ModelViewer({ projectId, hasRealOutput }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationRef = useRef<number>(0);
  const [modelStatus, setModelStatus] = useState<"loading" | "demo" | "loaded" | "error">("loading");

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d23);
    scene.fog = new THREE.Fog(0x1a1d23, 40, 80);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(15, 12, 15);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x4488aa, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(10, 15, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x00aaff, 0.4);
    pointLight.position.set(-5, 8, -5);
    scene.add(pointLight);

    // Try to load a real model if available
    let loadedReal = false;

    async function tryLoadRealModel() {
      if (!projectId || !hasRealOutput) {
        buildDemoScene();
        return;
      }

      try {
        // Try loading the textured OBJ from ODM output
        // ODM outputs: odm_texturing/odm_textured_model_geo.obj
        // We'll try to fetch metadata about available outputs
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/output/all.zip`);
        if (res.ok) {
          // Real output exists — for now show demo with "real data" indicator
          // Full PLY/OBJ parsing would require importing loaders dynamically
          buildDemoScene();
          setModelStatus("loaded");
          loadedReal = true;
          return;
        }
      } catch {
        // No real output available
      }

      buildDemoScene();
    }

    function buildDemoScene() {
      if (!loadedReal) setModelStatus("demo");

      // Ground plane (terrain simulation)
      const groundGeo = new THREE.PlaneGeometry(50, 50, 80, 80);
      const vertices = groundGeo.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i);
        const y = vertices.getY(i);
        const z =
          Math.sin(x * 0.3) * Math.cos(y * 0.3) * 1.5 +
          Math.sin(x * 0.7 + 1) * 0.5 +
          Math.cos(y * 0.5) * 0.8;
        vertices.setZ(i, z);
      }
      groundGeo.computeVertexNormals();

      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x3a5a3a,
        roughness: 0.85,
        metalness: 0.05,
        flatShading: true,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -2;
      ground.receiveShadow = true;
      scene.add(ground);

      // Buildings (cuboids)
      const buildingMat = new THREE.MeshStandardMaterial({
        color: 0x8899aa,
        roughness: 0.4,
        metalness: 0.2,
      });

      const buildings = [
        { pos: [0, 0, 0], size: [3, 6, 3] },
        { pos: [5, 0, -2], size: [2, 4, 2.5] },
        { pos: [-4, 0, 3], size: [2.5, 8, 2.5] },
        { pos: [3, 0, 5], size: [1.8, 3, 1.8] },
        { pos: [-2, 0, -5], size: [3.5, 5, 2] },
        { pos: [7, 0, 3], size: [2, 3.5, 2] },
        { pos: [-6, 0, -3], size: [1.5, 2.5, 3] },
      ];

      buildings.forEach(({ pos, size }) => {
        const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const mesh = new THREE.Mesh(geo, buildingMat.clone());
        mesh.position.set(pos[0], size[1] / 2 - 2, pos[2]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
      });

      // Point cloud effect (random scatter)
      const pointsGeo = new THREE.BufferGeometry();
      const pointCount = 3000;
      const positions = new Float32Array(pointCount * 3);
      const colors = new Float32Array(pointCount * 3);
      for (let i = 0; i < pointCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 40;
        positions[i * 3 + 1] = Math.random() * 8 - 2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 40;

        const g = 0.3 + Math.random() * 0.4;
        colors[i * 3] = g * 0.6;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = g * 0.7;
      }
      pointsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      pointsGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const pointsMat = new THREE.PointsMaterial({
        size: 0.08,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
      });
      const pointCloud = new THREE.Points(pointsGeo, pointsMat);
      scene.add(pointCloud);

      // Grid
      const grid = new THREE.GridHelper(50, 50, 0x333344, 0x222233);
      grid.position.y = -2;
      scene.add(grid);

      // Axes
      const axes = new THREE.AxesHelper(5);
      axes.position.y = -1.9;
      scene.add(axes);
    }

    tryLoadRealModel();

    // Mouse interaction for orbiting
    let mouseDown = false;
    let mouseX = 0;
    let mouseY = 0;
    let rotationX = 0;
    let rotationY = Math.PI / 6;
    let radius = 20;

    const onMouseDown = (e: MouseEvent) => {
      mouseDown = true;
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDown) return;
      const dx = e.clientX - mouseX;
      const dy = e.clientY - mouseY;
      rotationX += dx * 0.005;
      rotationY = Math.max(0.1, Math.min(Math.PI / 2.1, rotationY + dy * 0.005));
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const onMouseUp = () => {
      mouseDown = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radius = Math.max(5, Math.min(50, radius + e.deltaY * 0.02));
    };

    container.addEventListener("mousedown", onMouseDown);
    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mouseup", onMouseUp);
    container.addEventListener("mouseleave", onMouseUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    // Auto-rotate when not interacting
    let lastInteraction = 0;

    // Animation loop
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);

      if (!mouseDown) {
        const now = Date.now();
        if (now - lastInteraction > 2000) {
          rotationX += 0.002;
        }
      } else {
        lastInteraction = Date.now();
      }

      camera.position.x = Math.sin(rotationX) * Math.cos(rotationY) * radius;
      camera.position.y = Math.sin(rotationY) * radius;
      camera.position.z = Math.cos(rotationX) * Math.cos(rotationY) * radius;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    // Resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(animationRef.current);
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("mouseleave", onMouseUp);
      container.removeEventListener("wheel", onWheel);
      ro.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [projectId, hasRealOutput]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative cursor-grab active:cursor-grabbing"
      data-testid="model-viewer"
    >
      {/* Status indicator */}
      <div className="absolute top-4 right-4 z-10">
        {modelStatus === "demo" && (
          <div className="bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs px-2.5 py-1 rounded-md backdrop-blur">
            Demo Scene — Process images to generate real 3D model
          </div>
        )}
        {modelStatus === "loaded" && (
          <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs px-2.5 py-1 rounded-md backdrop-blur">
            Real Output Available
          </div>
        )}
      </div>
      {/* HUD overlay */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs text-white/60 pointer-events-none">
        <span>Drag to orbit</span>
        <span>&middot;</span>
        <span>Scroll to zoom</span>
      </div>
      <div className="absolute bottom-4 right-4 flex items-center gap-3 text-xs font-mono text-white/50 pointer-events-none tabular-nums">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />X
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Y
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Z
        </span>
      </div>
    </div>
  );
}
