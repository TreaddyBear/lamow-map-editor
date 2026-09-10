import { useEffect, useRef } from "react";
import { ArcRotateCamera, Color3, Color4, Engine, GizmoManager, HemisphericLight, Mesh, MeshBuilder, PointerEventTypes, Scene, StandardMaterial, TransformNode, Vector3, VertexData } from "@babylonjs/core";
import { objPrimitiveToRenderData, type ObjPrimitiveMesh, type ObjPrimitiveVertex } from "../utilities/assets/objPrimitives";

type Props = {
  primitive: ObjPrimitiveMesh;
  selectedVertexIndex: number;
  onSelectVertex: (index: number) => void;
  onVertexChange: (index: number, patch: Pick<ObjPrimitiveVertex, "x" | "y" | "z">) => void;
};

type Runtime = {
  camera: ArcRotateCamera;
  canvas: HTMLCanvasElement;
  currentPrimitiveId?: string;
  engine: Engine;
  gizmoManager: GizmoManager;
  markerMaterial: StandardMaterial;
  markers: Mesh[];
  mesh: Mesh;
  scene: Scene;
  selectedMaterial: StandardMaterial;
  selectedNode: TransformNode;
};

export function ObjPrimitiveBabylonEditor({ primitive, selectedVertexIndex, onSelectVertex, onVertexChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const primitiveRef = useRef(primitive);
  const selectedVertexIndexRef = useRef(selectedVertexIndex);
  const onSelectVertexRef = useRef(onSelectVertex);
  const onVertexChangeRef = useRef(onVertexChange);

  useEffect(() => {
    primitiveRef.current = primitive;
  }, [primitive]);

  useEffect(() => {
    selectedVertexIndexRef.current = selectedVertexIndex;
  }, [selectedVertexIndex]);

  useEffect(() => {
    onSelectVertexRef.current = onSelectVertex;
    onVertexChangeRef.current = onVertexChange;
  }, [onSelectVertex, onVertexChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { antialias: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.08, 0.1, 0.08, 1);

    const light = new HemisphericLight("objPrimitiveLight", new Vector3(-0.35, 1, 0.45), scene);
    light.intensity = 0.95;

    const camera = new ArcRotateCamera("objPrimitiveCamera", -Math.PI / 2.35, Math.PI / 2.55, 2.6, Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.minZ = 0.005;
    camera.maxZ = 50;
    camera.lowerRadiusLimit = 0.25;
    camera.upperRadiusLimit = 12;
    camera.wheelPrecision = 45;
    camera.inertia = 0;
    camera.panningSensibility = 0;

    const mesh = new Mesh("obj-primitive-source", scene);
    mesh.isPickable = false;
    const meshMaterial = new StandardMaterial("obj-primitive-source-mat", scene);
    meshMaterial.diffuseColor = Color3.White();
    meshMaterial.specularColor = Color3.Black();
    meshMaterial.backFaceCulling = false;
    meshMaterial.twoSidedLighting = true;
    mesh.material = meshMaterial;

    const markerMaterial = new StandardMaterial("obj-primitive-marker-mat", scene);
    markerMaterial.diffuseColor = new Color3(0.88, 0.9, 0.86);
    markerMaterial.specularColor = Color3.Black();

    const selectedMaterial = new StandardMaterial("obj-primitive-selected-marker-mat", scene);
    selectedMaterial.diffuseColor = new Color3(1, 0.72, 0.18);
    selectedMaterial.emissiveColor = new Color3(0.36, 0.17, 0.02);
    selectedMaterial.specularColor = Color3.Black();

    const selectedNode = new TransformNode("obj-primitive-selected-node", scene);
    const gizmoManager = new GizmoManager(scene);
    gizmoManager.positionGizmoEnabled = true;
    gizmoManager.rotationGizmoEnabled = false;
    gizmoManager.scaleGizmoEnabled = false;
    gizmoManager.boundingBoxGizmoEnabled = false;
    gizmoManager.usePointerToAttachGizmos = false;
    gizmoManager.attachToNode(selectedNode);
    if (gizmoManager.gizmos.positionGizmo) {
      gizmoManager.gizmos.positionGizmo.scaleRatio = 0.7;
      const dragBehaviors = [
        gizmoManager.gizmos.positionGizmo.xGizmo.dragBehavior,
        gizmoManager.gizmos.positionGizmo.yGizmo.dragBehavior,
        gizmoManager.gizmos.positionGizmo.zGizmo.dragBehavior,
      ];
      for (const dragBehavior of dragBehaviors) {
        dragBehavior.onDragStartObservable.add(() => camera.detachControl());
        dragBehavior.onDragObservable.add(() => {
          const index = selectedVertexIndexRef.current;
          const next = selectedNode.position;
          moveMarker(runtimeRef.current, index, next);
          onVertexChangeRef.current(index, {
            x: snapVertexCoordinate(next.x),
            y: snapVertexCoordinate(next.y),
            z: snapVertexCoordinate(next.z),
          });
        });
        dragBehavior.onDragEndObservable.add(() => camera.attachControl(canvas, true));
      }
    }

    scene.onPointerObservable.add((event) => {
      if (event.type !== PointerEventTypes.POINTERPICK) return;
      const index = event.pickInfo?.pickedMesh?.metadata?.vertexIndex;
      if (typeof index === "number") onSelectVertexRef.current(index);
    });

    runtimeRef.current = {
      camera,
      canvas,
      engine,
      gizmoManager,
      markerMaterial,
      markers: [],
      mesh,
      scene,
      selectedMaterial,
      selectedNode,
    };

    applyPrimitive(runtimeRef.current, primitiveRef.current);
    applySelectedVertex(runtimeRef.current, selectedVertexIndexRef.current);

    let visible = true;
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    intersection.observe(canvas);
    engine.runRenderLoop(() => { if (visible && !document.hidden) scene.render(); });
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      intersection.disconnect();
      runtimeRef.current = null;
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    applyPrimitive(runtime, primitive);
    applySelectedVertex(runtime, selectedVertexIndex);
  }, [primitive]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    applySelectedVertex(runtime, selectedVertexIndex);
  }, [selectedVertexIndex]);

  return (
    <div data-testid="obj-primitive-viewport" className="relative overflow-hidden rounded-md border border-[var(--surface-border)] bg-[#121711]">
      <canvas ref={canvasRef} data-testid="obj-primitive-canvas" className="h-52 w-full touch-none" />
      <div aria-hidden="true" className="pointer-events-none absolute left-2 top-2 flex gap-1 text-[10px] font-black leading-none">
        <span className="rounded border border-red-500/40 bg-red-500/15 px-1 py-0.5 text-red-200">X</span>
        <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1 py-0.5 text-emerald-200">Y</span>
        <span className="rounded border border-sky-500/40 bg-sky-500/15 px-1 py-0.5 text-sky-200">Z</span>
      </div>
    </div>
  );
}

function applyPrimitive(runtime: Runtime, primitive: ObjPrimitiveMesh) {
  const shouldRefit = runtime.currentPrimitiveId !== primitive.id;
  runtime.currentPrimitiveId = primitive.id;
  runtime.mesh.metadata = { primitive };
  const renderData = objPrimitiveToRenderData(primitive);
  const normals: number[] = [];
  VertexData.ComputeNormals(renderData.positions, renderData.indices, normals);
  const data = new VertexData();
  data.positions = renderData.positions;
  data.indices = renderData.indices;
  data.normals = normals;
  data.colors = renderData.colors;
  data.applyToMesh(runtime.mesh, true);
  runtime.mesh.useVertexColors = true;

  syncMarkers(runtime, primitive);
  framePrimitive(runtime, primitive, shouldRefit);
}

function syncMarkers(runtime: Runtime, primitive: ObjPrimitiveMesh) {
  while (runtime.markers.length > primitive.vertices.length) {
    runtime.markers.pop()?.dispose();
  }
  const diameter = markerDiameter(primitive);
  const activeIndex = selectedIndex(runtime);
  while (runtime.markers.length < primitive.vertices.length) {
    const index = runtime.markers.length;
    const marker = MeshBuilder.CreateSphere(`obj-primitive-vertex-${index}`, { diameter, segments: 10 }, runtime.scene);
    marker.metadata = { vertexIndex: index };
    marker.material = runtime.markerMaterial;
    marker.isPickable = true;
    runtime.markers.push(marker);
  }
  for (const [index, vertex] of primitive.vertices.entries()) {
    const marker = runtime.markers[index];
    marker.position.set(vertex.x, vertex.y, vertex.z);
    marker.scaling.setAll(1);
    marker.material = index === activeIndex ? runtime.selectedMaterial : runtime.markerMaterial;
  }
}

function applySelectedVertex(runtime: Runtime, rawIndex: number) {
  const primitive = primitiveFromRuntime(runtime);
  const index = selectedVertexIndexSafe(primitive, rawIndex);
  const vertex = primitive.vertices[index];
  runtime.selectedNode.metadata = { vertexIndex: index };
  if (vertex) runtime.selectedNode.position.set(vertex.x, vertex.y, vertex.z);
  for (const [markerIndex, marker] of runtime.markers.entries()) {
    marker.material = markerIndex === index ? runtime.selectedMaterial : runtime.markerMaterial;
  }
}

function moveMarker(runtime: Runtime | null, index: number, position: Vector3) {
  const marker = runtime?.markers[index];
  if (!marker) return;
  marker.position.copyFrom(position);
}

function framePrimitive(runtime: Runtime, primitive: ObjPrimitiveMesh, shouldRefit: boolean) {
  const bounds = primitiveBounds(primitive);
  const target = bounds.center;
  if (shouldRefit) runtime.camera.setTarget(target);
  const radius = Math.max(0.7, bounds.radius * 2.45);
  if (shouldRefit || !Number.isFinite(runtime.camera.radius) || runtime.camera.radius < 0.25) runtime.camera.radius = radius;
  runtime.camera.lowerRadiusLimit = Math.max(0.1, bounds.radius * 0.24);
  runtime.camera.upperRadiusLimit = Math.max(2, bounds.radius * 6);
}

function primitiveFromRuntime(runtime: Runtime) {
  const source = runtime.mesh.metadata?.primitive as ObjPrimitiveMesh | undefined;
  return source ?? { id: "empty", displayName: "Empty", vertices: [], faces: [], sharpEdges: [] };
}

function selectedIndex(runtime: Runtime) {
  return selectedVertexIndexSafe(primitiveFromRuntime(runtime), runtime.selectedNode.metadata?.vertexIndex ?? 0);
}

function selectedVertexIndexSafe(primitive: ObjPrimitiveMesh, rawIndex: number) {
  return Math.min(Math.max(0, rawIndex), Math.max(0, primitive.vertices.length - 1));
}

function markerDiameter(primitive: ObjPrimitiveMesh) {
  return Math.max(0.025, Math.min(0.08, primitiveBounds(primitive).radius * 0.08));
}

function primitiveBounds(primitive: ObjPrimitiveMesh) {
  if (!primitive.vertices.length) return { center: Vector3.Zero(), radius: 0.5 };
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const vertex of primitive.vertices) {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    minZ = Math.min(minZ, vertex.z);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
    maxZ = Math.max(maxZ, vertex.z);
  }
  const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  let radius = 0.5;
  for (const vertex of primitive.vertices) {
    radius = Math.max(radius, Vector3.Distance(center, new Vector3(vertex.x, vertex.y, vertex.z)));
  }
  return { center, radius };
}

function snapVertexCoordinate(value: number) {
  return Number(value.toFixed(4));
}
