import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Layout, LayoutCamera } from "../shared/types";
import { addEquipmentDetail, createShapeAssets } from "./scene-shapes";

const MAX_SCENE_OBJECTS = 500;

export interface SceneHandle {
  readCamera: () => Pick<LayoutCamera, "position" | "target"> | null;
  applyCamera: (camera: Pick<LayoutCamera, "position" | "target">) => void;
  resetCamera: () => void;
  captureSnapshot: (caption: string) => string | null;
  exportGlb: () => Promise<ArrayBuffer | null>;
  previewCameraPath: (
    cameras: Pick<LayoutCamera, "position" | "target">[],
    durationSeconds: number,
  ) => boolean;
  stopCameraPath: () => void;
}

type Runtime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  defaultCamera: Pick<LayoutCamera, "position" | "target">;
};

const roundedVector = (vector: THREE.Vector3) => ({
  x: Math.round(vector.x * 1000) / 1000,
  y: Math.round(vector.y * 1000) / 1000,
  z: Math.round(vector.z * 1000) / 1000,
});

const Scene = forwardRef<
  SceneHandle,
  {
    layout: Layout;
    hidden: string[];
    selection: string | null;
    onSelect: (id: string | null) => void;
  }
>(function Scene({ layout, hidden, selection, onSelect }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const meshes = useRef(new Map<string, THREE.Mesh>());
  const onSelectRef = useRef(onSelect);
  const pathFrame = useRef<number | null>(null);
  const [error, setError] = useState("");
  const visibleObjects = layout.objects.filter(
    (object) => !hidden.includes(object.layer),
  );
  const renderedCount = Math.min(visibleObjects.length, MAX_SCENE_OBJECTS);
  const selectedObject = layout.objects.find(
    (object) => object.id === selection,
  );

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useImperativeHandle(ref, () => ({
    readCamera: () => {
      const current = runtime.current;
      if (!current) return null;
      return {
        position: roundedVector(current.camera.position),
        target: roundedVector(current.controls.target),
      };
    },
    applyCamera: (saved) => {
      const current = runtime.current;
      if (!current) return;
      current.camera.position.set(
        saved.position.x,
        saved.position.y,
        saved.position.z,
      );
      current.controls.target.set(
        saved.target.x,
        saved.target.y,
        saved.target.z,
      );
      current.controls.update();
      current.renderer.render(current.scene, current.camera);
    },
    resetCamera: () => {
      const current = runtime.current;
      if (!current) return;
      current.camera.position.set(
        current.defaultCamera.position.x,
        current.defaultCamera.position.y,
        current.defaultCamera.position.z,
      );
      current.controls.target.set(
        current.defaultCamera.target.x,
        current.defaultCamera.target.y,
        current.defaultCamera.target.z,
      );
      current.controls.update();
      current.renderer.render(current.scene, current.camera);
    },
    captureSnapshot: (caption) => {
      const current = runtime.current;
      if (!current) return null;
      current.renderer.render(current.scene, current.camera);
      const source = current.renderer.domElement;
      const footer = 72;
      const output = document.createElement("canvas");
      output.width = source.width;
      output.height = source.height + footer;
      const context = output.getContext("2d");
      if (!context) return null;
      context.drawImage(source, 0, 0);
      context.fillStyle = "#f7f8f3";
      context.fillRect(0, source.height, output.width, footer);
      context.fillStyle = "#25372e";
      context.font = "600 18px sans-serif";
      context.fillText(caption, 22, source.height + 30);
      context.fillStyle = "#617064";
      context.font = "13px sans-serif";
      context.fillText(
        `${layout.width} m × ${layout.depth} m · ${layout.verified ? "medidas verificadas" : "medidas sin verificar"}`,
        22,
        source.height + 53,
      );
      return output.toDataURL("image/png");
    },
    exportGlb: async () => {
      const current = runtime.current;
      if (!current) return null;
      const { GLTFExporter } =
        await import("three/addons/exporters/GLTFExporter.js");
      const exporter = new GLTFExporter();
      const result = await exporter.parseAsync(current.scene, {
        binary: true,
        onlyVisible: true,
      });
      return result instanceof ArrayBuffer ? result : null;
    },
    previewCameraPath: (cameras, durationSeconds) => {
      const current = runtime.current;
      if (!current || cameras.length < 2) return false;
      if (pathFrame.current !== null) cancelAnimationFrame(pathFrame.current);
      current.controls.enabled = false;
      const startedAt = performance.now();
      const duration = Math.max(1, durationSeconds) * 1_000;
      const renderPath = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const scaled = progress * (cameras.length - 1);
        const fromIndex = Math.min(Math.floor(scaled), cameras.length - 2);
        const amount = scaled - fromIndex;
        const from = cameras[fromIndex];
        const to = cameras[fromIndex + 1];
        current.camera.position.set(
          THREE.MathUtils.lerp(from.position.x, to.position.x, amount),
          THREE.MathUtils.lerp(from.position.y, to.position.y, amount),
          THREE.MathUtils.lerp(from.position.z, to.position.z, amount),
        );
        current.controls.target.set(
          THREE.MathUtils.lerp(from.target.x, to.target.x, amount),
          THREE.MathUtils.lerp(from.target.y, to.target.y, amount),
          THREE.MathUtils.lerp(from.target.z, to.target.z, amount),
        );
        current.camera.lookAt(current.controls.target);
        if (progress < 1) pathFrame.current = requestAnimationFrame(renderPath);
        else {
          pathFrame.current = null;
          current.controls.enabled = true;
          current.controls.update();
        }
      };
      pathFrame.current = requestAnimationFrame(renderPath);
      return true;
    },
    stopCameraPath: () => {
      if (pathFrame.current !== null) cancelAnimationFrame(pathFrame.current);
      pathFrame.current = null;
      if (runtime.current) runtime.current.controls.enabled = true;
    },
  }));

  useEffect(() => {
    for (const [id, mesh] of meshes.current) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const selected = id === selection;
      material.emissive.set(selected ? "#9fbd72" : "#000000");
      material.emissiveIntensity = selected ? 0.45 : 0;
      const edges = mesh.children[0] as THREE.LineSegments | undefined;
      if (edges) {
        const edgeMaterial = edges.material as THREE.LineBasicMaterial;
        edgeMaterial.color.set(selected ? "#244f35" : "#344b3d");
        edgeMaterial.opacity = selected ? 0.95 : 0.2;
      }
    }
    const current = runtime.current;
    if (current) current.renderer.render(current.scene, current.camera);
  }, [selection]);

  useEffect(() => {
    const host = container.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: visibleObjects.length <= 250,
        alpha: false,
        preserveDrawingBuffer: true,
      });
    } catch {
      setError(
        "El renderizado 3D no está disponible en este navegador. El plano sigue disponible en la vista 2D.",
      );
      return;
    }
    setError("");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e9ede7");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    const scale = Math.max(layout.width, layout.depth);
    const defaultCamera = {
      position: {
        x: layout.width * 1.1,
        y: scale * 0.95,
        z: layout.depth * 1.25,
      },
      target: { x: layout.width / 2, y: 0, z: layout.depth / 2 },
    };
    camera.position.set(
      defaultCamera.position.x,
      defaultCamera.position.y,
      defaultCamera.position.z,
    );
    renderer.setPixelRatio(
      visibleObjects.length > 250 ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Diseño 3D interactivo del evento",
    );
    renderer.domElement.tabIndex = 0;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(
      defaultCamera.target.x,
      defaultCamera.target.y,
      defaultCamera.target.z,
    );
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 3;
    controls.maxDistance = scale * 5;
    runtime.current = { renderer, scene, camera, controls, defaultCamera };

    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(10, 30, 10);
    scene.add(light);
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(layout.width, 0.15, layout.depth),
      new THREE.MeshStandardMaterial({ color: "#f7f7f1", roughness: 0.9 }),
    );
    floor.position.set(layout.width / 2, -0.1, layout.depth / 2);
    scene.add(floor);
    const grid = new THREE.GridHelper(
      Math.max(layout.width, layout.depth),
      Math.max(layout.width, layout.depth),
      "#b3beb1",
      "#dce1d7",
    );
    grid.position.set(layout.width / 2, 0, layout.depth / 2);
    scene.add(grid);
    const colors: Record<string, string> = {
      Wall: "#7f8b84",
      Door: "#a98266",
      Window: "#6ea6bc",
      Stage: "#596b60",
      Table: "#b9c9ab",
      Chair: "#afc3cf",
      Booth: "#c8bad9",
      "LED wall": "#7299ac",
      Speaker: "#404851",
      Light: "#dfc67d",
      Truss: "#919fa5",
      Exit: "#a7ceac",
      Screen: "#98bbc9",
      Decoration: "#bba48f",
    };
    meshes.current.clear();
    const shapes = createShapeAssets();
    for (const object of visibleObjects.slice(0, MAX_SCENE_OBJECTS)) {
      const geometry =
        object.kind === "Table"
          ? new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
          : new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: object.surfaceColor || colors[object.kind] || "#b4beb2",
          roughness: 0.7,
        }),
      );
      mesh.scale.set(object.width, Math.max(0.1, object.height), object.depth);
      mesh.position.set(
        object.x + object.width / 2,
        Math.max(0.1, object.height) / 2,
        object.y + object.depth / 2,
      );
      mesh.rotation.y = (-object.rotation * Math.PI) / 180;
      mesh.userData.layoutObjectId = object.id;
      mesh.userData.assetStatus = "approximate-geometric";
      scene.add(mesh);
      meshes.current.set(object.id, mesh);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
          color: object.id === selection ? "#244f35" : "#344b3d",
          transparent: true,
          opacity: object.id === selection ? 0.95 : 0.2,
        }),
      );
      mesh.add(edges);
      // Detail goes after the edges, which the selection effect reads as children[0].
      if (addEquipmentDetail(object, mesh, shapes))
        mesh.userData.assetStatus = "approximate-procedural";
      if (object.id === selection) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.emissive.set("#9fbd72");
        material.emissiveIntensity = 0.45;
      }
      if (object.surfaceLabel) {
        const labelCanvas = document.createElement("canvas");
        labelCanvas.width = 512;
        labelCanvas.height = 128;
        const context = labelCanvas.getContext("2d")!;
        context.fillStyle = "#fffffff0";
        context.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
        context.fillStyle = "#25372e";
        context.font = "600 38px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(
          object.surfaceLabel.slice(0, 40),
          labelCanvas.width / 2,
          labelCanvas.height / 2,
          labelCanvas.width - 30,
        );
        const texture = new THREE.CanvasTexture(labelCanvas);
        const label = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: texture, transparent: true }),
        );
        label.position.set(
          object.x + object.width / 2,
          Math.max(0.1, object.height) + 0.55,
          object.y + object.depth / 2,
        );
        label.scale.set(Math.min(5, Math.max(2, object.width)), 0.7, 1);
        scene.add(label);
      }
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart: { x: number; y: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY };
    };
    const pointerUp = (event: PointerEvent) => {
      if (
        !pointerStart ||
        Math.hypot(
          event.clientX - pointerStart.x,
          event.clientY - pointerStart.y,
        ) > 5
      ) {
        pointerStart = null;
        return;
      }
      pointerStart = null;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster
        .intersectObjects([...meshes.current.values()], false)
        .at(0)?.object as THREE.Mesh | undefined;
      onSelectRef.current(hit?.userData.layoutObjectId || null);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSelectRef.current(null);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("keydown", keyDown);

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight || 500;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let frame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    return () => {
      if (pathFrame.current !== null) cancelAnimationFrame(pathFrame.current);
      pathFrame.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("keydown", keyDown);
      controls.dispose();
      scene.traverse((entry) => {
        const item = entry as THREE.Mesh;
        item.geometry?.dispose();
        if (item.material) {
          const materials = Array.isArray(item.material)
            ? item.material
            : [item.material];
          materials.forEach((material) => {
            const map = (material as THREE.SpriteMaterial).map;
            map?.dispose();
            material.dispose();
          });
        }
      });
      meshes.current.clear();
      runtime.current = null;
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [layout.width, layout.depth, layout.objects, hidden]);

  return (
    <div className="scene-container" ref={container}>
      <div className="scene-status" aria-live="polite">
        <strong>{renderedCount} objetos geométricos</strong>
        <span>
          {visibleObjects.length > MAX_SCENE_OBJECTS
            ? `Vista limitada a ${MAX_SCENE_OBJECTS} de ${visibleObjects.length} objetos`
            : "Formas aproximadas con las medidas del plano"}
        </span>
        {selectedObject && <span>Seleccionado: {selectedObject.label}</span>}
      </div>
      {error && (
        <div className="empty scene-error">
          <h3>La vista 3D no está disponible</h3>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
});

export default Scene;
