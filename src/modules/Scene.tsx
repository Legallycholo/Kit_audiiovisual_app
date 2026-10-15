import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Layout } from "../shared/types";
export default function Scene({
  layout,
  hidden,
}: {
  layout: Layout;
  hidden: string[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const host = container.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError(
        "3D rendering is unavailable in this browser. Your layout is still available in the 2D view.",
      );
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e9ede7");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    const scale = Math.max(layout.width, layout.depth);
    camera.position.set(layout.width * 1.1, scale * 0.95, layout.depth * 1.25);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D event layout",
    );
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(layout.width / 2, 0, layout.depth / 2);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 3;
    controls.maxDistance = scale * 5;
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
    for (const o of layout.objects.filter(
      (obj) => !hidden.includes(obj.layer),
    )) {
      const geometry =
        o.kind === "Table"
          ? new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
          : new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: colors[o.kind] || "#b4beb2",
          roughness: 0.7,
        }),
      );
      mesh.scale.set(o.width, Math.max(0.1, o.height), o.depth);
      mesh.position.set(
        o.x + o.width / 2,
        Math.max(0.1, o.height) / 2,
        o.y + o.depth / 2,
      );
      mesh.rotation.y = (-o.rotation * Math.PI) / 180;
      mesh.userData.layoutObjectId = o.id;
      scene.add(mesh);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
          color: "#344b3d",
          transparent: true,
          opacity: 0.2,
        }),
      );
      mesh.add(edges);
    }
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
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        const item = object as THREE.Mesh;
        item.geometry?.dispose();
        if (item.material) {
          const mats = Array.isArray(item.material)
            ? item.material
            : [item.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [layout.width, layout.depth, layout.objects, hidden]);
  return (
    <div className="scene-container" ref={container}>
      {error && (
        <div className="empty">
          <h3>3D view unavailable</h3>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
