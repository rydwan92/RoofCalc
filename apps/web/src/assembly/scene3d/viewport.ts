import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Camera,
  type Material,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  fitCamera,
  sceneGeometryCorners,
  type SceneBounds,
  type SceneCameraPose,
  type SceneProjection,
  type SceneViewPreset,
  type TechnicalScene,
  type TechnicalSceneEntity,
} from '@cieslacalc/technical-scene';
import type { SceneEntityVisibility } from '@cieslacalc/technical-scene';
import {
  SCENE_EMPHASIS_COLOR,
  SCENE_GROUP_COLOR,
  sceneInstanceKey,
  type SceneEmphasis,
} from './scene-presentation';

/**
 * The Three.js technical viewport (V38).
 *
 * It renders an already-resolved `TechnicalScene` and nothing else. It never
 * computes roof geometry, member lengths, cuts or quantities — every number it
 * touches was resolved upstream. Its own concerns are cameras, materials,
 * instancing, picking and framing.
 */

const FOV_DEG = 38;

/** Emphasis is a small lift toward white, or a fade toward the background. */
const WHITE = new Color('#ffffff');
const FADE = new Color('#e4e9e3');

/** Vertex index pairs of a box's twelve edges, for the shared corner order. */
const BOX_EDGE_PAIRS: readonly [number, number][] = (() => {
  const pairs: [number, number][] = [];
  for (let a = 0; a < 8; a += 1)
    for (let b = a + 1; b < 8; b += 1) {
      const diff = a ^ b;
      if (diff === 1 || diff === 2 || diff === 4) pairs.push([a, b]);
    }
  return pairs;
})();

/**
 * Which corner pairs form an entity's visible edges.
 *
 * `sceneGeometryCorners` emits an extruded profile as two corners per profile
 * point (near face, far face, in profile order), so its wireframe is the two
 * caps plus one edge per profile vertex.
 */
function entityEdgePairs(
  entity: TechnicalSceneEntity,
): readonly [number, number][] {
  if (entity.geometry.kind !== 'extruded-profile') return BOX_EDGE_PAIRS;
  const count = entity.geometry.profile.length;
  const pairs: [number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    pairs.push([index * 2, next * 2]);
    pairs.push([index * 2 + 1, next * 2 + 1]);
    pairs.push([index * 2, index * 2 + 1]);
  }
  return pairs;
}

export interface EntityPresentation {
  emphasis: SceneEmphasis;
  visibility: SceneEntityVisibility;
}

export interface ViewportPick {
  entityId: string;
}

interface InstanceBucket {
  solid: InstancedMesh;
  ghost: InstancedMesh;
  entities: TechnicalSceneEntity[];
  matrices: Matrix4[];
}

function matrixOf(entity: TechnicalSceneEntity): Matrix4 {
  if (entity.geometry.kind === 'extruded-profile') {
    // Local (x, y, z) = (along, up, width), matching how the extruded profile
    // geometry below is built and centred.
    const { basis, origin } = entity.geometry;
    return new Matrix4().set(
      basis.along.x,
      basis.up.x,
      basis.width.x,
      origin.x,
      basis.along.y,
      basis.up.y,
      basis.width.y,
      origin.y,
      basis.along.z,
      basis.up.z,
      basis.width.z,
      origin.z,
      0,
      0,
      0,
      1,
    );
  }
  if (entity.geometry.kind !== 'oriented-box') return new Matrix4();
  const { basis, center } = entity.geometry;
  // Columns are the declared right-handed order (width, along, depth), which
  // matches the BoxGeometry axes (x = section width, y = length, z = depth).
  return new Matrix4().set(
    basis.width.x,
    basis.along.x,
    basis.depth.x,
    center.x,
    basis.width.y,
    basis.along.y,
    basis.depth.y,
    center.y,
    basis.width.z,
    basis.along.z,
    basis.depth.z,
    center.z,
    0,
    0,
    0,
    1,
  );
}

export class TechnicalViewport {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly perspectiveCamera: PerspectiveCamera;
  private readonly orthographicCamera: OrthographicCamera;
  private readonly solids = new Group();
  private readonly planes = new Group();
  private readonly edges: LineSegments;
  private readonly selectionEdges: LineSegments;
  private readonly selectionHalo: LineSegments;
  private readonly relatedEdges: LineSegments;
  private readonly hoverEdges: LineSegments;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly geometryCache = new Map<
    string,
    BoxGeometry | ExtrudeGeometry
  >();
  private readonly buckets = new Map<string, InstanceBucket>();
  /** Entities that are their own object rather than an instanced bucket. */
  private readonly meshes = new Map<string, Mesh | LineSegments>();
  private readonly materials: Material[] = [];
  private controls: OrbitControls;
  private projection: SceneProjection = 'perspective';
  private technicalScene?: TechnicalScene;
  private pose: SceneCameraPose;
  private frameRequested = false;
  private disposed = false;
  /**
   * Whether the user has taken control of the camera. Until they do, the
   * viewport re-frames itself when its size changes, so a panel opening next
   * to it never leaves the roof half out of view. Once they have orbited,
   * panned or zoomed, their camera is theirs and only an explicit
   * "Dopasuj widok" moves it.
   */
  private userMovedCamera = false;
  /** Renderer-local hover. Never mirrored into the workbench store. */
  private hoveredEntityId?: string;
  /** Bounds of the last explicit fit, reused when the viewport is resized. */
  private fittedBounds?: SceneBounds;
  private fittedPreset: SceneViewPreset = 'isometric';
  private fittedPadding?: number;
  /** Optional external reference (IFC roof surface). Never pickable. */
  private reference?: Group;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new Color('#eef1ec');

    const aspect = this.aspect();
    this.perspectiveCamera = new PerspectiveCamera(FOV_DEG, aspect, 1, 100000);
    this.orthographicCamera = new OrthographicCamera(
      -1,
      1,
      1,
      -1,
      -100000,
      100000,
    );
    // The technical scene is Z-up, exactly as the resolved roof model is.
    // No axis swap happens anywhere in the pipeline.
    for (const camera of [this.perspectiveCamera, this.orthographicCamera])
      camera.up.set(0, 0, 1);

    // Simple, readable lighting: enough contrast between a timber's faces to
    // read depth, with no shadows, environment map or post-processing.
    this.scene.add(new AmbientLight(0xffffff, 0.5));
    this.scene.add(new HemisphereLight(0xffffff, 0x8d9a8f, 1.0));
    const key = new DirectionalLight(0xffffff, 1.35);
    key.position.set(1, -1.4, 2.2);
    this.scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.4);
    fill.position.set(-1.4, 1, 0.5);
    this.scene.add(fill);

    this.scene.add(this.planes);
    this.scene.add(this.solids);
    this.edges = new LineSegments(
      new BufferGeometry(),
      this.track(
        new LineBasicMaterial({
          color: SCENE_EMPHASIS_COLOR.edge,
          transparent: true,
          opacity: 0.55,
        }),
      ),
    );
    this.selectionEdges = new LineSegments(
      new BufferGeometry(),
      this.track(
        new LineBasicMaterial({ color: SCENE_EMPHASIS_COLOR.selected }),
      ),
    );
    this.selectionHalo = new LineSegments(
      new BufferGeometry(),
      this.track(
        new LineBasicMaterial({
          color: SCENE_EMPHASIS_COLOR.selected,
          transparent: true,
          opacity: 0.3,
          depthTest: false,
        }),
      ),
    );
    this.relatedEdges = new LineSegments(
      new BufferGeometry(),
      this.track(
        new LineBasicMaterial({
          color: SCENE_EMPHASIS_COLOR.related,
          transparent: true,
          opacity: 0.9,
        }),
      ),
    );
    this.hoverEdges = new LineSegments(
      new BufferGeometry(),
      this.track(
        new LineBasicMaterial({
          color: SCENE_EMPHASIS_COLOR.hover,
          transparent: true,
          opacity: 0.85,
        }),
      ),
    );
    this.selectionEdges.renderOrder = 2;
    this.selectionHalo.renderOrder = 3;
    this.hoverEdges.renderOrder = 1;
    this.scene.add(
      this.edges,
      this.relatedEdges,
      this.selectionEdges,
      this.selectionHalo,
      this.hoverEdges,
    );

    this.pose = fitCamera({
      bounds: {
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 1 },
        center: { x: 0, y: 0, z: 0 },
        size: { x: 2, y: 2, z: 2 },
        radiusMm: 1000,
        empty: true,
      },
      preset: 'isometric',
      aspect,
    });
    this.controls = this.createControls();
    this.applyPose(this.pose);
  }

  private track<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private aspect() {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    return width / height;
  }

  private get camera(): Camera {
    return this.projection === 'perspective'
      ? this.perspectiveCamera
      : this.orthographicCamera;
  }

  private createControls() {
    const controls = new OrbitControls(this.camera, this.canvas);
    // Technical constraints: no damping (so rendering stays on demand), no
    // flipping past the poles, and a bounded orbit radius so the camera can
    // never drift away from the model.
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.minPolarAngle = 0.01;
    controls.maxPolarAngle = Math.PI - 0.01;
    controls.minDistance = this.pose.minDistanceMm;
    controls.maxDistance = this.pose.maxDistanceMm;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.85;
    controls.addEventListener('change', () => this.requestFrame());
    controls.addEventListener('start', () => {
      this.userMovedCamera = true;
    });
    return controls;
  }

  /** Rebuilds every mesh. Called only when the resolved scene itself changes. */
  setScene(scene: TechnicalScene) {
    this.technicalScene = scene;
    this.clearSolids();
    const byKey = new Map<string, TechnicalSceneEntity[]>();
    for (const entity of scene.entities) {
      if (entity.geometry.kind === 'polygon') {
        this.addPlane(entity);
        continue;
      }
      if (entity.geometry.kind === 'line') {
        this.addReferenceLine(entity);
        continue;
      }
      if (
        entity.geometry.kind !== 'oriented-box' &&
        entity.geometry.kind !== 'extruded-profile'
      )
        continue;
      const key = sceneInstanceKey(entity);
      const list = byKey.get(key);
      if (list) list.push(entity);
      else byKey.set(key, [entity]);
    }
    for (const [key, entities] of byKey) this.addBucket(key, entities);
    this.requestFrame();
  }

  private addPlane(entity: TechnicalSceneEntity) {
    if (entity.geometry.kind !== 'polygon') return;
    const points = entity.geometry.points;
    if (points.length < 3) return;
    // A roof plane is planar, so it is triangulated in its own 2D frame and
    // then placed back by one rigid transform. No geometry is invented.
    const origin = new Vector3(points[0]!.x, points[0]!.y, points[0]!.z);
    const u = new Vector3(points[1]!.x, points[1]!.y, points[1]!.z)
      .sub(origin)
      .normalize();
    const normal = new Vector3(points[2]!.x, points[2]!.y, points[2]!.z)
      .sub(origin)
      .cross(u)
      .normalize();
    if (normal.lengthSq() < 0.5) return;
    const v = new Vector3().crossVectors(normal, u).normalize();
    const shape = new Shape(
      points.map((point) => {
        const local = new Vector3(point.x, point.y, point.z).sub(origin);
        return new Vector2(local.dot(u), local.dot(v));
      }),
    );
    const mesh = new Mesh(
      new ShapeGeometry(shape),
      this.track(
        new MeshBasicMaterial({
          color: SCENE_GROUP_COLOR['roof-plane'].base,
          transparent: true,
          opacity: 0.13,
          side: DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    const placement = new Matrix4().makeBasis(u, v, normal).setPosition(origin);
    mesh.applyMatrix4(placement);
    mesh.renderOrder = -1;
    mesh.userData.entityId = entity.id;
    this.planes.add(mesh);
    // A thin outline makes the plane readable without adding an opaque
    // surface that would hide the timber it is meant to explain.
    const outline = new LineLoop(
      new BufferGeometry().setFromPoints(
        points.map((point) => new Vector3(point.x, point.y, point.z)),
      ),
      this.track(
        new LineBasicMaterial({
          color: SCENE_GROUP_COLOR['roof-plane'].shade,
          transparent: true,
          opacity: 0.55,
        }),
      ),
    );
    this.planes.add(outline);
  }

  /** A reference line, such as a hip boundary whose detail is undecided. */
  private addReferenceLine(entity: TechnicalSceneEntity) {
    if (entity.geometry.kind !== 'line') return;
    const { from, to } = entity.geometry;
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([from.x, from.y, from.z, to.x, to.y, to.z]),
        3,
      ),
    );
    const line = new LineSegments(
      geometry,
      this.track(
        new LineDashedMaterial({
          color: SCENE_GROUP_COLOR[entity.semanticGroup].shade,
          dashSize: 120,
          gapSize: 90,
          linewidth: 2,
        }),
      ),
    );
    line.computeLineDistances();
    line.renderOrder = 2;
    line.userData.entityId = entity.id;
    line.frustumCulled = false;
    this.solids.add(line);
    this.meshes.set(entity.id, line);
  }

  private addBucket(key: string, entities: TechnicalSceneEntity[]) {
    const first = entities[0]!;
    let geometry = this.geometryCache.get(key);
    if (!geometry) {
      if (first.geometry.kind === 'oriented-box') {
        const { widthMm, alongMm, depthMm } = first.geometry.size;
        geometry = new BoxGeometry(widthMm, alongMm, depthMm);
      } else if (first.geometry.kind === 'extruded-profile') {
        // Every K1 sharing a prototype shares this profile, so the finished
        // solid stays instanced exactly like the reference prism it replaces.
        const { profile, thicknessMm } = first.geometry;
        if (profile.length < 3) return;
        const extruded = new ExtrudeGeometry(
          new Shape(profile.map((point) => new Vector2(point.x, point.y))),
          { depth: thicknessMm, bevelEnabled: false, steps: 1 },
        );
        extruded.translate(0, 0, -thicknessMm / 2);
        geometry = extruded;
      } else return;
      this.geometryCache.set(key, geometry);
    }
    const solid = new InstancedMesh(
      geometry,
      this.track(new MeshLambertMaterial({ color: 0xffffff })),
      entities.length,
    );
    const ghost = new InstancedMesh(
      geometry,
      this.track(
        new MeshLambertMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        }),
      ),
      entities.length,
    );
    ghost.renderOrder = 1;
    solid.count = 0;
    ghost.count = 0;
    solid.frustumCulled = false;
    ghost.frustumCulled = false;
    this.solids.add(solid, ghost);
    this.buckets.set(key, {
      solid,
      ghost,
      entities,
      matrices: entities.map(matrixOf),
    });
  }

  private clearSolids() {
    for (const bucket of this.buckets.values()) {
      bucket.solid.dispose();
      bucket.ghost.dispose();
      this.solids.remove(bucket.solid, bucket.ghost);
    }
    this.buckets.clear();
    for (const object of this.meshes.values()) {
      object.geometry.dispose();
      this.solids.remove(object);
    }
    this.meshes.clear();
    for (const child of [...this.planes.children]) {
      if (child instanceof Mesh || child instanceof LineLoop)
        child.geometry.dispose();
      this.planes.remove(child);
    }
    for (const geometry of this.geometryCache.values()) geometry.dispose();
    this.geometryCache.clear();
  }

  /**
   * Applies emphasis and visibility without rebuilding any geometry, so
   * selecting, isolating, filtering and X-ray stay cheap.
   */
  setPresentation(
    presentation: ReadonlyMap<string, EntityPresentation>,
    showRoofPlanes: boolean,
  ) {
    const color = new Color();
    const edgePositions: number[] = [];
    const relatedPositions: number[] = [];
    const selectionPositions: number[] = [];
    for (const bucket of this.buckets.values()) {
      let solidCount = 0;
      let ghostCount = 0;
      bucket.solid.userData.entityIds = [] as string[];
      bucket.ghost.userData.entityIds = [] as string[];
      for (const [index, entity] of bucket.entities.entries()) {
        const state = presentation.get(entity.id);
        if (!state || state.visibility === 'hidden') continue;
        const matrix = bucket.matrices[index]!;
        if (state.visibility === 'ghosted') {
          bucket.ghost.setMatrixAt(ghostCount, matrix);
          bucket.ghost.setColorAt(
            ghostCount,
            color.set(SCENE_GROUP_COLOR[entity.semanticGroup].shade),
          );
          (bucket.ghost.userData.entityIds as string[])[ghostCount] = entity.id;
          ghostCount += 1;
          continue;
        }
        bucket.solid.setMatrixAt(solidCount, matrix);
        // Timber keeps its semantic family colour in every state, exactly as
        // in the 2D skeleton: emphasis is carried by the edges, with only a
        // slight lift or fade on the body. Recolouring a whole family would
        // turn a hip roof into a block of selection colour.
        color.set(SCENE_GROUP_COLOR[entity.semanticGroup].base);
        if (state.emphasis === 'selected') color.lerp(WHITE, 0.14);
        else if (state.emphasis === 'related') color.lerp(FADE, 0.4);
        bucket.solid.setColorAt(solidCount, color);
        (bucket.solid.userData.entityIds as string[])[solidCount] = entity.id;
        solidCount += 1;
        const corners = sceneGeometryCorners(entity.geometry);
        const target =
          state.emphasis === 'selected'
            ? selectionPositions
            : state.emphasis === 'related'
              ? relatedPositions
              : edgePositions;
        for (const [a, b] of entityEdgePairs(entity)) {
          const start = corners[a];
          const end = corners[b];
          if (!start || !end) continue;
          target.push(start.x, start.y, start.z);
          target.push(end.x, end.y, end.z);
        }
      }
      bucket.solid.count = solidCount;
      bucket.ghost.count = ghostCount;
      bucket.solid.instanceMatrix.needsUpdate = true;
      bucket.ghost.instanceMatrix.needsUpdate = true;
      if (bucket.solid.instanceColor)
        bucket.solid.instanceColor.needsUpdate = true;
      if (bucket.ghost.instanceColor)
        bucket.ghost.instanceColor.needsUpdate = true;
      bucket.solid.visible = solidCount > 0;
      bucket.ghost.visible = ghostCount > 0;
      // The bounding sphere is cached per instance count, so picking would
      // silently miss members after a filter change without this.
      if (solidCount > 0) bucket.solid.computeBoundingSphere();
    }
    // Standalone objects (finished solids, reference lines) follow the same
    // policy as instanced members, without joining a bucket.
    for (const [entityId, object] of this.meshes) {
      const state = presentation.get(entityId);
      const visible = !!state && state.visibility !== 'hidden';
      object.visible = visible;
      const material = object.material as Material & {
        color?: Color;
        opacity?: number;
        transparent?: boolean;
      };
      if (visible && material.color) {
        const entity = this.technicalScene?.entities.find(
          (candidate) => candidate.id === entityId,
        );
        const group = entity?.semanticGroup;
        if (group) {
          material.color.set(SCENE_GROUP_COLOR[group].base);
          if (state!.emphasis === 'selected') material.color.lerp(WHITE, 0.14);
          else if (state!.emphasis === 'related')
            material.color.lerp(FADE, 0.4);
        }
        material.transparent = state!.visibility === 'ghosted';
        material.opacity = state!.visibility === 'ghosted' ? 0.18 : 1;
        material.needsUpdate = true;
      }
    }
    this.planes.visible = showRoofPlanes;
    this.hoveredEntityId = undefined;
    this.setLinePositions(this.hoverEdges, []);
    this.setLinePositions(this.edges, edgePositions);
    this.setLinePositions(this.relatedEdges, relatedPositions);
    this.setLinePositions(this.selectionEdges, selectionPositions);
    this.setLinePositions(this.selectionHalo, selectionPositions);
    this.requestFrame();
  }

  private setLinePositions(lines: LineSegments, positions: number[]) {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(positions), 3),
    );
    lines.geometry.dispose();
    lines.geometry = geometry;
    lines.visible = positions.length > 0;
  }

  setProjection(projection: SceneProjection) {
    if (projection === this.projection) return;
    const target = this.controls.target.clone();
    const position = this.camera.position.clone();
    this.projection = projection;
    this.controls.dispose();
    this.camera.position.copy(position);
    this.controls = this.createControls();
    this.controls.target.copy(target);
    this.applyPose({ ...this.pose, position, target });
  }

  /** Refreshes both frustums for the current viewport aspect. */
  private applyFrustums(resetZoom: boolean) {
    const aspect = this.aspect();
    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.near = this.pose.nearMm;
    this.perspectiveCamera.far = this.pose.farMm;
    this.perspectiveCamera.updateProjectionMatrix();
    const halfHeight = this.pose.orthographicHalfHeightMm;
    this.orthographicCamera.left = -halfHeight * aspect;
    this.orthographicCamera.right = halfHeight * aspect;
    this.orthographicCamera.top = halfHeight;
    this.orthographicCamera.bottom = -halfHeight;
    if (resetZoom) this.orthographicCamera.zoom = 1;
    this.orthographicCamera.updateProjectionMatrix();
  }

  /** Points the camera exactly where the pure fit helper said to. */
  applyPose(pose: SceneCameraPose) {
    this.pose = pose;
    this.applyFrustums(true);
    const camera = this.camera;
    camera.up.set(pose.up.x, pose.up.y, pose.up.z);
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.controls.target.set(pose.target.x, pose.target.y, pose.target.z);
    this.controls.minDistance = pose.minDistanceMm;
    this.controls.maxDistance = pose.maxDistanceMm;
    camera.lookAt(this.controls.target);
    this.controls.update();
    this.requestFrame();
  }

  /** Frames the given bounds from the given preset, using only pure math. */
  fit(bounds: SceneBounds, preset: SceneViewPreset, paddingFactor?: number) {
    this.fittedBounds = bounds;
    this.fittedPreset = preset;
    this.fittedPadding = paddingFactor;
    this.userMovedCamera = false;
    this.applyPose(
      fitCamera({
        bounds,
        preset,
        aspect: this.aspect(),
        fovDeg: FOV_DEG,
        paddingFactor,
      }),
    );
  }

  /** Keeps the current direction and re-frames the given bounds. */
  fitKeepingDirection(bounds: SceneBounds, paddingFactor?: number) {
    const camera = this.camera;
    const direction = camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 1e-6) {
      this.fit(bounds, 'isometric', paddingFactor);
      return;
    }
    const pose = fitCamera({
      bounds,
      preset: 'isometric',
      aspect: this.aspect(),
      fovDeg: FOV_DEG,
      paddingFactor,
    });
    this.userMovedCamera = true;
    direction.normalize().multiplyScalar(pose.distanceMm);
    this.applyPose({
      ...pose,
      up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
      position: {
        x: pose.target.x + direction.x,
        y: pose.target.y + direction.y,
        z: pose.target.z + direction.z,
      },
    });
  }

  /** Returns the entity under a client point, or nothing. */
  pick(clientX: number, clientY: number): ViewportPick | undefined {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = [
      ...[...this.buckets.values()]
        .filter((bucket) => bucket.solid.count > 0)
        .map((bucket) => bucket.solid),
      ...[...this.meshes.values()].filter(
        (object): object is Mesh => object instanceof Mesh && object.visible,
      ),
    ];
    for (const hit of this.raycaster.intersectObjects(meshes, false)) {
      const ids = hit.object.userData.entityIds as string[] | undefined;
      const entityId =
        typeof hit.instanceId === 'number'
          ? ids?.[hit.instanceId]
          : (hit.object.userData.entityId as string | undefined);
      if (entityId) return { entityId };
    }
    return undefined;
  }

  /**
   * Draws a quiet outline around the hovered member. Hover is renderer-local
   * transient feedback: it never touches the canonical workbench selection.
   * Returns true when something selectable is under the pointer.
   */
  hover(clientX: number, clientY: number): boolean {
    const hit = this.pick(clientX, clientY);
    const entity = hit ? this.entity(hit.entityId) : undefined;
    if (this.hoveredEntityId === (entity?.id ?? undefined))
      return !!entity?.selectable;
    this.hoveredEntityId = entity?.id;
    const positions: number[] = [];
    if (entity?.selectable) {
      const corners = sceneGeometryCorners(entity.geometry);
      for (const [a, b] of BOX_EDGE_PAIRS) {
        positions.push(corners[a]!.x, corners[a]!.y, corners[a]!.z);
        positions.push(corners[b]!.x, corners[b]!.y, corners[b]!.z);
      }
    }
    this.setLinePositions(this.hoverEdges, positions);
    this.requestFrame();
    return !!entity?.selectable;
  }

  clearHover() {
    if (!this.hoveredEntityId) return;
    this.hoveredEntityId = undefined;
    this.setLinePositions(this.hoverEdges, []);
    this.requestFrame();
  }

  entity(entityId: string): TechnicalSceneEntity | undefined {
    return this.technicalScene?.entities.find(
      (candidate) => candidate.id === entityId,
    );
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    if (!this.userMovedCamera && this.fittedBounds) {
      // The user has not taken the camera yet, so keep the whole model framed.
      this.fit(this.fittedBounds, this.fittedPreset, this.fittedPadding);
      return;
    }
    // Otherwise only the frustum follows: the user's own camera is untouched.
    this.applyFrustums(false);
    this.requestFrame();
  }

  /**
   * Shows a display-only reference surface (for example the architect's IFC
   * roof) in the same frame as the roof: subdued, translucent, with its own
   * outline. It is not part of the technical scene, selection or bounds.
   */
  setReference(mesh?: { positions: Float32Array; indices: Uint32Array }) {
    if (this.reference) {
      this.scene.remove(this.reference);
      this.reference.traverse((object) => {
        if (object instanceof Mesh || object instanceof LineSegments)
          object.geometry.dispose();
      });
      this.reference = undefined;
    }
    if (mesh) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
      geometry.setIndex(new BufferAttribute(mesh.indices, 1));
      const group = new Group();
      group.add(
        new Mesh(
          geometry,
          this.track(
            new MeshBasicMaterial({
              color: 0x5f86b8,
              transparent: true,
              opacity: 0.2,
              side: DoubleSide,
              depthWrite: false,
            }),
          ),
        ),
      );
      group.add(
        new LineSegments(
          new EdgesGeometry(geometry, 1),
          this.track(
            new LineBasicMaterial({
              color: 0x3d6ea8,
              transparent: true,
              opacity: 0.75,
            }),
          ),
        ),
      );
      group.renderOrder = 5;
      this.reference = group;
      this.scene.add(group);
    }
    this.requestFrame();
  }

  private requestFrame() {
    if (this.frameRequested || this.disposed) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      if (this.disposed) return;
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose() {
    this.disposed = true;
    this.setReference(undefined);
    this.controls.dispose();
    this.clearSolids();
    this.edges.geometry.dispose();
    this.relatedEdges.geometry.dispose();
    this.selectionEdges.geometry.dispose();
    this.selectionHalo.geometry.dispose();
    this.hoverEdges.geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.renderer.dispose();
  }
}
