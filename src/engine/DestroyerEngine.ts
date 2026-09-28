/**
 * Destroyer Engine - Master WebGPU Engine Class
 * "Flat Architecture · Indirect Draws · Subgroup Compaction · Vertex Animation · GLB Pipeline"
 */

import { Camera } from './camera/Camera';
import { DeviceManager } from './core/Device';
import { FlatEntityManager } from './core/FlatEntityManager';
import { DestroyerConfig, EngineStats, FlatMaterial } from './core/Types';
import { IndirectRenderer } from './render/IndirectRenderer';
import { VertexAnimationController } from './animation/VertexAnimation';
import { GLBLoader, ParsedGLBPrimitive } from './loaders/GLBLoader';
import { ProceduralModels } from './loaders/ProceduralModels';

export class DestroyerEngine {
  public readonly deviceManager: DeviceManager;
  public readonly entityManager: FlatEntityManager;
  public readonly camera: Camera;
  public readonly animation: VertexAnimationController;
  public renderer: IndirectRenderer | null = null;

  private isRunning = false;
  private animationFrameId: number | null = null;
  private lastTime = 0;
  private startTime = 0;

  // Stored geometry for mega-buffer packaging
  private packedPrimitives: ParsedGLBPrimitive[] = [];

  constructor() {
    this.deviceManager = DeviceManager.getInstance();
    this.entityManager = new FlatEntityManager(60000, 256, 2048);
    this.camera = new Camera();
    this.animation = new VertexAnimationController();
  }

  async init(config: DestroyerConfig): Promise<{ success: boolean; error?: string }> {
    const res = await this.deviceManager.init(config.enableSubgroups ?? true);
    if (res.error || !res.device) {
      return { success: false, error: res.error || 'Failed to initialize WebGPU device' };
    }

    this.renderer = new IndirectRenderer(this.deviceManager, config.canvas);
    this.renderer.enableSubgroups = config.enableSubgroups ?? true;
    this.renderer.enableCulling = config.enableCulling ?? true;

    await this.renderer.initPipelines(this.entityManager);

    // Initial canvas sizing
    this.resize(config.canvas.clientWidth || 1280, config.canvas.clientHeight || 720);

    return { success: true };
  }

  resize(width: number, height: number): void {
    if (this.renderer) {
      this.renderer.resize(width, height);
      this.camera.setAspect(width / Math.max(1, height));
    }
  }

  /**
   * Package a list of primitives into unified vertex & index buffers and register flat meshes
   */
  public packAndUploadGeometry(primitives: ParsedGLBPrimitive[]): number[] {
    this.packedPrimitives = primitives;
    let totalVertCount = 0;
    let totalIndexCount = 0;

    for (const p of primitives) {
      totalVertCount += p.positions.length / 3;
      totalIndexCount += p.indices.length;
    }

    // Vertex Stride = 22 floats (88 bytes)
    // 3 pos + 3 norm + 2 uv + 4 joints (stored as u32 in memory) + 4 weights (f32) + 3 morph0 + 3 morph1
    const vertexRawBuffer = new ArrayBuffer(totalVertCount * 22 * 4);
    const vertexFloatView = new Float32Array(vertexRawBuffer);
    const vertexUintView = new Uint32Array(vertexRawBuffer);
    const indexArray = new Uint32Array(totalIndexCount);

    let vCursor = 0;
    let iCursor = 0;
    const meshIds: number[] = [];

    for (const p of primitives) {
      const vCount = p.positions.length / 3;
      const baseVertex = vCursor;
      const firstIndex = iCursor;

      const hasJoints = !!(p.joints && p.weights);
      const hasMorph = !!(p.morphTargets && p.morphTargets.length > 0);

      // Pack vertices
      for (let i = 0; i < vCount; i++) {
        const floatOffset = (vCursor + i) * 22;

        // Position (3)
        vertexFloatView[floatOffset + 0] = p.positions[i * 3];
        vertexFloatView[floatOffset + 1] = p.positions[i * 3 + 1];
        vertexFloatView[floatOffset + 2] = p.positions[i * 3 + 2];

        // Normal (3)
        vertexFloatView[floatOffset + 3] = p.normals[i * 3];
        vertexFloatView[floatOffset + 4] = p.normals[i * 3 + 1];
        vertexFloatView[floatOffset + 5] = p.normals[i * 3 + 2];

        // UV (2)
        vertexFloatView[floatOffset + 6] = p.uvs[i * 2];
        vertexFloatView[floatOffset + 7] = p.uvs[i * 2 + 1];

        // Joints uint32x4 (4)
        if (hasJoints && p.joints) {
          vertexUintView[floatOffset + 8] = p.joints[i * 4];
          vertexUintView[floatOffset + 9] = p.joints[i * 4 + 1];
          vertexUintView[floatOffset + 10] = p.joints[i * 4 + 2];
          vertexUintView[floatOffset + 11] = p.joints[i * 4 + 3];
        } else {
          vertexUintView[floatOffset + 8] = 0;
          vertexUintView[floatOffset + 9] = 0;
          vertexUintView[floatOffset + 10] = 0;
          vertexUintView[floatOffset + 11] = 0;
        }

        // Weights float32x4 (4)
        if (hasJoints && p.weights) {
          vertexFloatView[floatOffset + 12] = p.weights[i * 4];
          vertexFloatView[floatOffset + 13] = p.weights[i * 4 + 1];
          vertexFloatView[floatOffset + 14] = p.weights[i * 4 + 2];
          vertexFloatView[floatOffset + 15] = p.weights[i * 4 + 3];
        } else {
          vertexFloatView[floatOffset + 12] = 0;
          vertexFloatView[floatOffset + 13] = 0;
          vertexFloatView[floatOffset + 14] = 0;
          vertexFloatView[floatOffset + 15] = 0;
        }

        // Morph Target 0 Delta (3)
        if (hasMorph && p.morphTargets![0]) {
          vertexFloatView[floatOffset + 16] = p.morphTargets![0].deltaPositions[i * 3];
          vertexFloatView[floatOffset + 17] = p.morphTargets![0].deltaPositions[i * 3 + 1];
          vertexFloatView[floatOffset + 18] = p.morphTargets![0].deltaPositions[i * 3 + 2];
        } else {
          vertexFloatView[floatOffset + 16] = 0;
          vertexFloatView[floatOffset + 17] = 0;
          vertexFloatView[floatOffset + 18] = 0;
        }

        // Morph Target 1 Delta (3)
        if (hasMorph && p.morphTargets![1]) {
          vertexFloatView[floatOffset + 19] = p.morphTargets![1].deltaPositions[i * 3];
          vertexFloatView[floatOffset + 20] = p.morphTargets![1].deltaPositions[i * 3 + 1];
          vertexFloatView[floatOffset + 21] = p.morphTargets![1].deltaPositions[i * 3 + 2];
        } else {
          vertexFloatView[floatOffset + 19] = 0;
          vertexFloatView[floatOffset + 20] = 0;
          vertexFloatView[floatOffset + 21] = 0;
        }
      }

      // Pack indices
      indexArray.set(p.indices, iCursor);

      // Register Mesh in Flat Entity Manager
      const meshId = this.entityManager.registerMesh({
        name: p.name,
        firstIndex,
        indexCount: p.indices.length,
        baseVertex,
        vertexCount: vCount,
        boundingRadius: p.boundingRadius,
        hasSkinning: hasJoints,
        hasMorphTargets: hasMorph,
        morphTargetCount: p.morphTargets ? p.morphTargets.length : 0
      });
      meshIds.push(meshId);

      vCursor += vCount;
      iCursor += p.indices.length;
    }

    if (this.renderer) {
      this.renderer.uploadGeometry(vertexFloatView, indexArray);
    }

    return meshIds;
  }

  /**
   * Parse and load a custom GLB file into the engine
   */
  loadGLB(arrayBuffer: ArrayBuffer): { meshIds: number[]; primitiveCount: number } {
    const parsed = GLBLoader.parse(arrayBuffer);
    this.entityManager.clear();

    // Register materials
    const matIdMap = new Map<FlatMaterial, number>();
    for (const p of parsed.primitives) {
      if (p.material && !matIdMap.has(p.material)) {
        const matId = this.entityManager.registerMaterial(p.material);
        matIdMap.set(p.material, matId);
      }
    }

    // Set animation joints & clips if present
    if (parsed.joints.length > 0) {
      this.animation.joints = parsed.joints;
      this.entityManager.totalJointsCount = parsed.joints.length;
    }
    if (parsed.clips.length > 0) {
      this.animation.clips = parsed.clips;
      this.animation.currentClipIndex = 0;
    }

    const meshIds = this.packAndUploadGeometry(parsed.primitives);

    // Spawn an entity for each primitive
    for (let i = 0; i < parsed.primitives.length; i++) {
      const p = parsed.primitives[i];
      const mId = meshIds[i];
      const matId = p.material ? (matIdMap.get(p.material) ?? 0) : 0;
      this.entityManager.createEntity(mId, matId, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1], p.boundingRadius, 0);
    }

    // Re-frame camera to fit
    this.camera.target = [0, 0, 0];
    this.camera.radius = Math.max(5, (parsed.primitives[0]?.boundingRadius || 2) * 3.5);
    this.camera.updatePositionFromSpherical();

    return { meshIds, primitiveCount: parsed.primitives.length };
  }

  /**
   * Built-in Scene Presets
   */
  loadScenePreset(preset: 'massive_indirect' | 'skinned_mech' | 'morph_core' | 'wave_terrain', instanceCount = 5000): void {
    this.entityManager.clear();
    this.animation.clips = [];
    this.animation.joints = [];

    if (preset === 'massive_indirect') {
      // Stress test: thousands of instanced entities with GPU culling and indirect draw
      const mechData = ProceduralModels.createSkinnedMech();
      const coreData = ProceduralModels.createMorphingCore();

      const mat1 = this.entityManager.registerMaterial({
        baseColor: [0.15, 0.75, 0.95, 1.0],
        emissiveColor: [0.0, 0.3, 0.6, 0.5],
        roughness: 0.2,
        metallic: 0.9,
        ao: 1.0,
        alphaCutoff: 0.5
      });

      const mat2 = this.entityManager.registerMaterial({
        baseColor: [0.95, 0.25, 0.35, 1.0],
        emissiveColor: [0.5, 0.05, 0.1, 0.8],
        roughness: 0.3,
        metallic: 0.7,
        ao: 1.0,
        alphaCutoff: 0.5
      });

      const mat3 = this.entityManager.registerMaterial({
        baseColor: [0.95, 0.85, 0.2, 1.0],
        emissiveColor: [0.4, 0.3, 0.0, 0.5],
        roughness: 0.15,
        metallic: 0.95,
        ao: 1.0,
        alphaCutoff: 0.5
      });

      const meshIds = this.packAndUploadGeometry([mechData.primitive, coreData.primitive]);

      // Distribute instances in a 3D field
      const grid = Math.cbrt(instanceCount);
      const spacing = 4.5;
      const halfExtent = (grid * spacing) * 0.5;

      let count = 0;
      for (let x = 0; x < grid && count < instanceCount; x++) {
        for (let y = 0; y < grid && count < instanceCount; y++) {
          for (let z = 0; z < grid && count < instanceCount; z++) {
            const px = x * spacing - halfExtent + (Math.random() - 0.5) * 1.5;
            const py = y * spacing - halfExtent * 0.5 + (Math.random() - 0.5) * 1.5;
            const pz = z * spacing - halfExtent + (Math.random() - 0.5) * 1.5;

            const mIdx = (count % 2 === 0) ? meshIds[0] : meshIds[1];
            const matIdx = (count % 3 === 0) ? mat1 : ((count % 3 === 1) ? mat2 : mat3);
            const scale = 0.6 + Math.random() * 0.5;

            // Random rotation
            const angle = Math.random() * Math.PI * 2;
            const rot: [number, number, number, number] = [0, Math.sin(angle * 0.5), 0, Math.cos(angle * 0.5)];

            this.entityManager.createEntity(
              mIdx,
              matIdx,
              [px, py, pz],
              rot,
              [scale, scale, scale],
              2.0 * scale,
              0
            );
            count++;
          }
        }
      }

      this.camera.radius = halfExtent * 2.2;
      this.camera.target = [0, 0, 0];
      this.camera.updatePositionFromSpherical();

    } else if (preset === 'skinned_mech') {
      const mechData = ProceduralModels.createSkinnedMech();
      this.animation.joints = mechData.joints;
      this.animation.clips = [mechData.clip];
      this.animation.currentClipIndex = 0;
      this.entityManager.totalJointsCount = mechData.joints.length;

      const matId = this.entityManager.registerMaterial(mechData.primitive.material!);
      const [mId] = this.packAndUploadGeometry([mechData.primitive]);

      // Spawn center hero mech
      this.entityManager.createEntity(mId, matId, [0, 0, 0], [0, 0, 0, 1], [1.5, 1.5, 1.5], 3.5, 0);

      // Spawn support squad
      this.entityManager.createEntity(mId, matId, [-5, 0, -3], [0, 0.2, 0, 0.98], [1.2, 1.2, 1.2], 3.0, 0);
      this.entityManager.createEntity(mId, matId, [5, 0, -3], [0, -0.2, 0, 0.98], [1.2, 1.2, 1.2], 3.0, 0);

      this.camera.radius = 14;
      this.camera.target = [0, 2, 0];
      this.camera.updatePositionFromSpherical();

    } else if (preset === 'morph_core') {
      const coreData = ProceduralModels.createMorphingCore();
      const matId = this.entityManager.registerMaterial(coreData.primitive.material!);
      const [mId] = this.packAndUploadGeometry([coreData.primitive]);

      // Spawn main core + orbital satellites
      this.entityManager.createEntity(mId, matId, [0, 0, 0], [0, 0, 0, 1], [2.2, 2.2, 2.2], 3.0, 0);

      const satCount = 8;
      for (let i = 0; i < satCount; i++) {
        const rad = (i / satCount) * Math.PI * 2;
        const dist = 7.5;
        this.entityManager.createEntity(
          mId,
          matId,
          [Math.cos(rad) * dist, Math.sin(rad * 2) * 1.5, Math.sin(rad) * dist],
          [0, 0, 0, 1],
          [0.7, 0.7, 0.7],
          1.2,
          0
        );
      }

      this.camera.radius = 18;
      this.camera.target = [0, 0, 0];
      this.camera.updatePositionFromSpherical();

    } else if (preset === 'wave_terrain') {
      const terrain = ProceduralModels.createTerrainGrid(64, 40);
      const matId = this.entityManager.registerMaterial(terrain.material!);
      const [mId] = this.packAndUploadGeometry([terrain]);

      this.entityManager.createEntity(mId, matId, [0, -2, 0], [0, 0, 0, 1], [1, 1, 1], 30.0, 0);
      if (this.renderer) {
        this.renderer.waveFactor = 1.0;
      }

      this.camera.radius = 32;
      this.camera.phi = 0.55;
      this.camera.target = [0, 0, 0];
      this.camera.updatePositionFromSpherical();
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.startTime = this.lastTime;
    this.tick();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private tick = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    const deltaTime = Math.min(0.1, (now - this.lastTime) * 0.001);
    const elapsedSeconds = (now - this.startTime) * 0.001;
    this.lastTime = now;

    // 1. Update Camera
    this.camera.update(deltaTime);

    // 2. Update Vertex Animation (Skeletal Skinning & Morph Targets)
    this.animation.update(deltaTime, this.entityManager.jointMatrices, 0);

    // Sync morph weights to renderer
    if (this.renderer) {
      this.renderer.morphWeights[0] = this.animation.morphWeights[0];
      this.renderer.morphWeights[1] = this.animation.morphWeights[1];
      this.renderer.morphWeights[2] = this.animation.morphWeights[2];
      this.renderer.morphWeights[3] = this.animation.morphWeights[3];
      this.renderer.waveFactor = this.animation.waveFactor;

      // 3. Execute Indirect Draw Frame
      this.renderer.render(this.camera, this.entityManager, elapsedSeconds);
    }

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  getStats(): EngineStats {
    if (!this.renderer) {
      return {
        fps: 0,
        frameTimeMs: 0,
        gpuCullTimeMs: 0,
        gpuRenderTimeMs: 0,
        totalInstances: 0,
        visibleInstances: 0,
        culledInstances: 0,
        subgroupsSupported: false,
        subgroupsActive: false,
        subgroupMinSize: 0,
        subgroupMaxSize: 0,
        totalVertices: 0,
        totalTriangles: 0,
        indirectDrawCommands: 0,
        bufferMemoryBytes: 0,
      };
    }
    return this.renderer.stats;
  }
}
