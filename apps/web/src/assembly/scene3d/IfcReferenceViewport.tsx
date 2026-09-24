import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { IfcReferenceModel } from '../../bim/ifc/ifc-runtime-types';

export type IfcViewDirection = 'fit' | 'top' | 'front' | 'side';

export function IfcReferenceViewport({
  model,
  visible,
  selectedId,
  onSelect,
  direction,
}: {
  model: IfcReferenceModel;
  visible: ReadonlySet<number>;
  selectedId?: number;
  onSelect: (id: number) => void;
  direction: IfcViewDirection;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    meshes: THREE.Mesh[];
    bounds: THREE.Box3;
  }>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
      });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor('#e6ebe9');
    const scene = new THREE.Scene();
    scene.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight('#ffffff', '#9aa8a2', 2.4));
    const light = new THREE.DirectionalLight('#ffffff', 2);
    light.position.set(1, -2, 4);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    const bounds = new THREE.Box3();
    const meshes: THREE.Mesh[] = [];
    for (const source of model.meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(source.positions, 3),
      );
      geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(
          source.color[0],
          source.color[1],
          source.color[2],
        ).lerp(new THREE.Color('#b9c9c4'), 0.65),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78,
        roughness: 0.9,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.expressId = source.expressId;
      scene.add(mesh);
      meshes.push(mesh);
      bounds.expandByObject(mesh);
    }
    runtime.current = { renderer, scene, camera, controls, meshes, bounds };
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);
    const extent = Math.max(size.length(), 1);
    controls.target.copy(center);
    camera.position
      .copy(center)
      .add(new THREE.Vector3(extent, -extent, extent));
    camera.near = Math.max(0.001, extent / 10000);
    camera.far = Math.max(100, extent * 100);
    camera.updateProjectionMatrix();
    controls.update();
    const resize = () => {
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    let frame = 0;
    const draw = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      renderer.dispose();
      runtime.current = null;
    };
  }, [model]);

  useEffect(() => {
    const view = runtime.current;
    if (!view) return;
    for (const mesh of view.meshes) {
      const id = mesh.userData.expressId as number;
      mesh.visible = visible.has(id);
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.emissive.set(id === selectedId ? '#007e68' : '#000000');
      material.emissiveIntensity = id === selectedId ? 0.6 : 0;
      material.opacity = id === selectedId ? 1 : 0.78;
    }
  }, [visible, selectedId]);

  useEffect(() => {
    const view = runtime.current;
    if (!view) return;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    view.bounds.getCenter(center);
    view.bounds.getSize(size);
    const distance = Math.max(size.length(), 1) * 1.6;
    const offsets: Record<IfcViewDirection, THREE.Vector3> = {
      fit: new THREE.Vector3(1, -1, 1),
      top: new THREE.Vector3(0.001, 0, 1),
      front: new THREE.Vector3(0, -1, 0.001),
      side: new THREE.Vector3(1, 0, 0.001),
    };
    view.controls.target.copy(center);
    view.camera.position
      .copy(center)
      .add(offsets[direction].normalize().multiplyScalar(distance));
    view.controls.update();
  }, [direction, model]);

  function selectAt(event: React.PointerEvent<HTMLCanvasElement>) {
    const view = runtime.current;
    if (!view) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, view.camera);
    const hit = raycaster.intersectObjects(
      view.meshes.filter((mesh) => mesh.visible),
    )[0];
    if (hit) onSelect(hit.object.userData.expressId as number);
  }

  return error ? (
    <p role="alert">Podgląd 3D nie jest dostępny w tej przeglądarce.</p>
  ) : (
    <canvas ref={canvasRef} onClick={selectAt} aria-label="Model IFC 3D" />
  );
}
