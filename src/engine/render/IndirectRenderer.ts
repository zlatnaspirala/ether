/**
 * Destroyer Engine - High Performance WebGPU Indirect Renderer
 * Executes:
 * 1. Compute Pass: Clear indirect counters
 * 2. Compute Pass: GPU Frustum Culling + Subgroup compaction -> writes indirect draw buffer
 * 3. Render Pass: Multi-mesh drawIndexedIndirect with flat storage buffers & PBR shading
 */

import { Camera } from '../camera/Camera';
import { DeviceManager } from '../core/Device';
import { FlatEntityManager } from '../core/FlatEntityManager';
import {
  DRAW_INDEXED_INDIRECT_STRIDE_BYTES,
  DRAW_INDEXED_INDIRECT_STRIDE_U32,
  EngineStats
} from '../core/Types';
import {
  CLEAR_INDIRECT_COMMANDS_WGSL,
  CULLING_STANDARD_WGSL,
  CULLING_SUBGROUPS_WGSL
} from '../shaders/CullingComputeWGSL';
import { RENDER_PIPELINE_WGSL } from '../shaders/RenderPipelineWGSL';

export class IndirectRenderer {
  private deviceManager: DeviceManager;
  private canvas: HTMLCanvasElement;
  private context: GPUCanvasContext;

  // WebGPU Resources
  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;

  // Mega Vertex & Index Buffers
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  public totalVertices = 0;
  public totalIndices = 0;

  // Indirect Buffer (GPUBufferUsage.INDIRECT | STORAGE | COPY_SRC | COPY_DST)
  private indirectBuffer: GPUBuffer | null = null;

  // Uniform Buffers
  private cameraUniformBuffer: GPUBuffer | null = null;
  private engineParamsBuffer: GPUBuffer | null = null;

  // Storage Buffers
  private entityStorageBuffer: GPUBuffer | null = null;
  private materialStorageBuffer: GPUBuffer | null = null;
  private visibleIndicesBuffer: GPUBuffer | null = null;
  private jointMatricesBuffer: GPUBuffer | null = null;
  private debugStatsBuffer: GPUBuffer | null = null;
  private statsReadbackBuffer: GPUBuffer | null = null;

  // Pipelines
  private clearPipeline: GPUComputePipeline | null = null;
  private cullingPipeline: GPUComputePipeline | null = null;
  private renderPipeline: GPURenderPipeline | null = null;

  // Bind Groups
  private clearBindGroup: GPUBindGroup | null = null;
  private cullingBindGroup: GPUBindGroup | null = null;
  private renderBindGroup: GPUBindGroup | null = null;

  // Settings
  public enableCulling = true;
  public enableSubgroups = true;
  public debugMode = 0; // 0: PBR, 1: Normals, 2: UVs, 3: Skinning, 4: Flat ID, 5: Roughness
  public waveFactor = 0.0;
  public morphWeights = [0.0, 0.0, 0.0, 0.0];

  // Stats
  public stats: EngineStats = {
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

  private frameCount = 0;
  private lastFpsTime = performance.now();
  private isReadingStats = false;

  constructor(deviceManager: DeviceManager, canvas: HTMLCanvasElement) {
    this.deviceManager = deviceManager;
    this.canvas = canvas;
    this.context = deviceManager.configureCanvas(canvas);

    this.stats.subgroupsSupported = deviceManager.subgroupsSupported;
    this.stats.subgroupMinSize = deviceManager.subgroupMinSize;
    this.stats.subgroupMaxSize = deviceManager.subgroupMaxSize;
  }

  async initPipelines(entityManager: FlatEntityManager): Promise<void> {
    const device = this.deviceManager.device;
    if (!device) throw new Error('WebGPU Device is not available');

    // 1. Create Clear Pipeline
    const clearModule = device.createShaderModule({
      label: 'Destroyer_ClearIndirect_WGSL',
      code: CLEAR_INDIRECT_COMMANDS_WGSL
    });
    this.clearPipeline = device.createComputePipeline({
      label: 'Destroyer_ClearIndirect_Pipeline',
      layout: 'auto',
      compute: { module: clearModule, entryPoint: 'main' }
    });

    // 2. Create Culling Pipeline (Subgroups or Standard fallback)
    const useSubgroups = this.deviceManager.subgroupsSupported && this.enableSubgroups;
    const cullingCode = useSubgroups ? CULLING_SUBGROUPS_WGSL : CULLING_STANDARD_WGSL;
    this.stats.subgroupsActive = useSubgroups;

    const cullingModule = device.createShaderModule({
      label: useSubgroups ? 'Destroyer_CullingSubgroups_WGSL' : 'Destroyer_CullingStandard_WGSL',
      code: cullingCode
    });

    this.cullingPipeline = device.createComputePipeline({
      label: 'Destroyer_Culling_Pipeline',
      layout: 'auto',
      compute: { module: cullingModule, entryPoint: 'main' }
    });

    // 3. Create Render Pipeline
    const renderModule = device.createShaderModule({
      label: 'Destroyer_RenderPipeline_WGSL',
      code: RENDER_PIPELINE_WGSL
    });

    // Vertex Buffer Layout:
    // Stride = 3 pos + 3 norm + 2 uv + 4 joints + 4 weights + 3 morph0 + 3 morph1 = 22 floats = 88 bytes
    // (joints are uint32, weights are float32)
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 88,
      stepMode: 'vertex',
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
        { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
        { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
        { shaderLocation: 3, offset: 32, format: 'uint32x4' },  // joints
        { shaderLocation: 4, offset: 48, format: 'float32x4' }, // weights
        { shaderLocation: 5, offset: 64, format: 'float32x3' }, // morphPos0
        { shaderLocation: 6, offset: 76, format: 'float32x3' }, // morphPos1
      ]
    };

    this.renderPipeline = device.createRenderPipeline({
      label: 'Destroyer_MainRender_Pipeline',
      layout: 'auto',
      vertex: {
        module: renderModule,
        entryPoint: 'vs_main',
        buffers: [vertexBufferLayout]
      },
      fragment: {
        module: renderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.deviceManager.format }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
        frontFace: 'ccw'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less'
      }
    });

    // 4. Create Buffers
    this.createBuffers(entityManager);
    this.resizeDepthTexture();
  }

  public resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.canvas.width = Math.max(1, width);
    this.canvas.height = Math.max(1, height);
    this.resizeDepthTexture();
  }

  private resizeDepthTexture(): void {
    const device = this.deviceManager.device;
    if (!device) return;

    if (this.depthTexture) {
      this.depthTexture.destroy();
    }

    this.depthTexture = device.createTexture({
      label: 'Destroyer_DepthTexture',
      size: [Math.max(1, this.canvas.width), Math.max(1, this.canvas.height), 1],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.depthTextureView = this.depthTexture.createView();
  }

  private createBuffers(entityManager: FlatEntityManager): void {
    const device = this.deviceManager.device;
    if (!device) return;

    // Camera Uniform Buffer:
    // viewProj (16) + view (16) + proj (16) + camPos (4) + 6 planes (24) + meta (4) = 80 floats = 320 bytes
    this.cameraUniformBuffer = device.createBuffer({
      label: 'Destroyer_CameraUniforms',
      size: 320,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // Engine Params Buffer:
    // time(1), debugMode(1), waveFactor(1), morph0(1), morph1(1), morph2(1), pad(2)
    // lightDir(4), lightColor(4), ambientColor(4) = 20 floats = 80 bytes (aligned to 96)
    this.engineParamsBuffer = device.createBuffer({
      label: 'Destroyer_EngineParams',
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // Flat Entity Storage Buffer (64-96 bytes per entity)
    const entityBufferSize = Math.max(256, entityManager.maxEntities * FlatEntityManager.ENTITY_STRIDE_FLOATS * 4);
    this.entityStorageBuffer = device.createBuffer({
      label: 'Destroyer_EntityStorage',
      size: entityBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // Flat Material Storage Buffer
    const materialBufferSize = Math.max(256, entityManager.maxMaterials * FlatEntityManager.MATERIAL_STRIDE_FLOATS * 4);
    this.materialStorageBuffer = device.createBuffer({
      label: 'Destroyer_MaterialStorage',
      size: materialBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // Indirect Draw Buffer (5 x uint32 per mesh = 20 bytes)
    const indirectBufferSize = Math.max(256, 128 * DRAW_INDEXED_INDIRECT_STRIDE_BYTES);
    this.indirectBuffer = device.createBuffer({
      label: 'Destroyer_IndirectCommandsBuffer',
      size: indirectBufferSize,
      usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });

    // Visible Indices Buffer: maximum capacity for all instances
    const visibleBufferSize = Math.max(256, entityManager.maxEntities * 4);
    this.visibleIndicesBuffer = device.createBuffer({
      label: 'Destroyer_VisibleIndicesStorage',
      size: visibleBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // Joint Matrices Storage Buffer
    const jointsBufferSize = Math.max(256, entityManager.maxJoints * 64);
    this.jointMatricesBuffer = device.createBuffer({
      label: 'Destroyer_JointMatricesStorage',
      size: jointsBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // Debug Stats Buffer: 4 atomics (16 bytes)
    this.debugStatsBuffer = device.createBuffer({
      label: 'Destroyer_DebugStats',
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });

    this.statsReadbackBuffer = device.createBuffer({
      label: 'Destroyer_StatsReadback',
      size: 16,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    this.stats.bufferMemoryBytes =
      entityBufferSize + materialBufferSize + indirectBufferSize + visibleBufferSize + jointsBufferSize;

    this.createBindGroups();
  }

  private createBindGroups(): void {
    const device = this.deviceManager.device;
    if (!device || !this.clearPipeline || !this.cullingPipeline || !this.renderPipeline) return;
    if (!this.indirectBuffer || !this.cameraUniformBuffer || !this.entityStorageBuffer ||
        !this.materialStorageBuffer || !this.visibleIndicesBuffer || !this.jointMatricesBuffer ||
        !this.engineParamsBuffer || !this.debugStatsBuffer) return;

    // 1. Clear Bind Group
    this.clearBindGroup = device.createBindGroup({
      label: 'Destroyer_Clear_BindGroup',
      layout: this.clearPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.indirectBuffer } },
        { binding: 1, resource: { buffer: this.debugStatsBuffer } },
      ]
    });

    // 2. Culling Bind Group
    this.cullingBindGroup = device.createBindGroup({
      label: 'Destroyer_Culling_BindGroup',
      layout: this.cullingPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
        { binding: 1, resource: { buffer: this.entityStorageBuffer } },
        { binding: 2, resource: { buffer: this.indirectBuffer } },
        { binding: 3, resource: { buffer: this.visibleIndicesBuffer } },
        { binding: 4, resource: { buffer: this.debugStatsBuffer } },
      ]
    });

    // 3. Render Bind Group
    this.renderBindGroup = device.createBindGroup({
      label: 'Destroyer_Render_BindGroup',
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
        { binding: 1, resource: { buffer: this.engineParamsBuffer } },
        { binding: 2, resource: { buffer: this.entityStorageBuffer } },
        { binding: 3, resource: { buffer: this.materialStorageBuffer } },
        { binding: 4, resource: { buffer: this.visibleIndicesBuffer } },
        { binding: 5, resource: { buffer: this.jointMatricesBuffer } },
      ]
    });
  }

  /**
   * Upload all packed mesh vertices and indices to unified GPU vertex/index mega-buffers
   */
  uploadGeometry(vertices: Float32Array, indices: Uint32Array): void {
    const device = this.deviceManager.device;
    if (!device) return;

    if (this.vertexBuffer) this.vertexBuffer.destroy();
    if (this.indexBuffer) this.indexBuffer.destroy();

    this.vertexBuffer = device.createBuffer({
      label: 'Destroyer_Unified_VertexBuffer',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    this.indexBuffer = device.createBuffer({
      label: 'Destroyer_Unified_IndexBuffer',
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Uint32Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();

    this.totalVertices = vertices.length / 22;
    this.totalIndices = indices.length;
    this.stats.totalVertices = this.totalVertices;
    this.stats.totalTriangles = Math.floor(indices.length / 3);
  }

  /**
   * Main Frame Render Execution
   */
  render(camera: Camera, entityManager: FlatEntityManager, timeSeconds: number): void {
    const device = this.deviceManager.device;
    if (!device || !this.context || !this.renderPipeline || !this.cullingPipeline || !this.clearPipeline) return;
    if (!this.indirectBuffer || !this.vertexBuffer || !this.indexBuffer || !this.depthTextureView) return;

    const frameStartTime = performance.now();
    const entityCount = entityManager.activeEntityCount;
    this.stats.totalInstances = entityCount;

    // 1. Upload Camera Uniforms (320 bytes)
    const cameraData = new Float32Array(80);
    cameraData.set(camera.viewProjMatrix, 0);  // 0..15
    cameraData.set(camera.viewMatrix, 16);     // 16..31
    cameraData.set(camera.projMatrix, 32);     // 32..47
    cameraData.set([camera.position[0], camera.position[1], camera.position[2], 1.0], 48); // 48..51

    // Frustum planes: use frozen planes if locked, or live planes
    const planesToUse = camera.isFrustumFrozen ? camera.frozenFrustumPlanes : camera.frustumPlanes;
    cameraData.set(planesToUse, 52); // 52..75

    // Meta: cullingEnabled, totalEntities, pad0, pad1
    const cameraUintView = new Uint32Array(cameraData.buffer);
    cameraUintView[76] = this.enableCulling ? 1 : 0;
    cameraUintView[77] = entityCount;
    cameraUintView[78] = 0;
    cameraUintView[79] = 0;
    device.queue.writeBuffer(this.cameraUniformBuffer!, 0, cameraData);

    // 2. Upload Engine Parameters
    const engineData = new Float32Array(24);
    engineData[0] = timeSeconds;
    new Uint32Array(engineData.buffer)[1] = this.debugMode;
    engineData[2] = this.waveFactor;
    engineData[3] = this.morphWeights[0];
    engineData[4] = this.morphWeights[1];
    engineData[5] = this.morphWeights[2];
    // Light direction [x, y, z, 0]
    engineData.set([-0.6, -1.2, -0.8, 0.0], 8);
    // Light color & intensity [r, g, b, intensity]
    engineData.set([1.0, 0.95, 0.9, 1.8], 12);
    // Ambient color [r, g, b, 1.0]
    engineData.set([0.15, 0.18, 0.22, 1.0], 16);
    device.queue.writeBuffer(this.engineParamsBuffer!, 0, engineData);

    // 3. Upload Flat Entity buffer, Materials buffer & Joint Matrices
    if (entityCount > 0) {
      const entityBytes = entityCount * FlatEntityManager.ENTITY_STRIDE_FLOATS * 4;
      device.queue.writeBuffer(this.entityStorageBuffer!, 0, entityManager.entityBufferRaw, 0, entityBytes);
    }

    if (entityManager.materialCount > 0) {
      const matBytes = entityManager.materialCount * FlatEntityManager.MATERIAL_STRIDE_FLOATS * 4;
      device.queue.writeBuffer(this.materialStorageBuffer!, 0, entityManager.materialBufferRaw, 0, matBytes);
    }

    if (entityManager.totalJointsCount > 0) {
      const jointBytes = entityManager.totalJointsCount * 16 * 4;
      device.queue.writeBuffer(this.jointMatricesBuffer!, 0, entityManager.jointMatrices, 0, jointBytes);
    }

    // Initialize base indexCount and firstIndex into indirect buffer for all meshes
    if (entityManager.meshRegistry.length > 0) {
      const cmdBytes = entityManager.meshRegistry.length * DRAW_INDEXED_INDIRECT_STRIDE_BYTES;
      device.queue.writeBuffer(this.indirectBuffer, 0, entityManager.indirectCommandsData, 0, cmdBytes);
    }

    // 4. Command Encoding
    const commandEncoder = device.createCommandEncoder({ label: 'Destroyer_FrameCommands' });

    // Step A: Compute Pass - Clear Indirect Counters
    const clearPass = commandEncoder.beginComputePass({ label: 'Destroyer_ClearIndirect_Pass' });
    clearPass.setPipeline(this.clearPipeline);
    clearPass.setBindGroup(0, this.clearBindGroup!);
    const clearWorkgroups = Math.max(1, Math.ceil(entityManager.meshRegistry.length / 64));
    clearPass.dispatchWorkgroups(clearWorkgroups, 1, 1);
    clearPass.end();

    // Step B: Compute Pass - GPU Frustum Culling & Subgroup Compaction
    if (entityCount > 0) {
      const cullPass = commandEncoder.beginComputePass({ label: 'Destroyer_Culling_Pass' });
      cullPass.setPipeline(this.cullingPipeline);
      cullPass.setBindGroup(0, this.cullingBindGroup!);
      const cullWorkgroups = Math.ceil(entityCount / 64);
      cullPass.dispatchWorkgroups(cullWorkgroups, 1, 1);
      cullPass.end();
    }

    // Step C: Render Pass - Multi-Mesh Indexed Indirect Draws
    const canvasTexture = this.context.getCurrentTexture();
    const renderPass = commandEncoder.beginRenderPass({
      label: 'Destroyer_PBR_RenderPass',
      colorAttachments: [{
        view: canvasTexture.createView(),
        clearValue: { r: 0.04, g: 0.04, b: 0.06, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: this.depthTextureView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroup!);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setIndexBuffer(this.indexBuffer, 'uint32');

    // Execute drawIndexedIndirect for every registered mesh!
    const meshCount = entityManager.meshRegistry.length;
    for (let m = 0; m < meshCount; m++) {
      const indirectOffset = m * DRAW_INDEXED_INDIRECT_STRIDE_BYTES;
      renderPass.drawIndexedIndirect(this.indirectBuffer, indirectOffset);
    }
    renderPass.end();

    // Step D: Copy debug stats buffer to readback buffer for asynchronous telemetry
    if (this.statsReadbackBuffer && this.debugStatsBuffer && !this.isReadingStats) {
      commandEncoder.copyBufferToBuffer(this.debugStatsBuffer, 0, this.statsReadbackBuffer, 0, 16);
    }

    // Submit commands to WebGPU queue
    device.queue.submit([commandEncoder.finish()]);

    // Asynchronously read back culling stats
    if (this.statsReadbackBuffer && !this.isReadingStats) {
      this.pollDebugStats();
    }

    // Frame Telemetry Calculation
    this.frameCount++;
    const now = performance.now();
    const frameTime = now - frameStartTime;
    this.stats.frameTimeMs = Number(frameTime.toFixed(2));

    if (now - this.lastFpsTime >= 500) {
      this.stats.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
    this.stats.indirectDrawCommands = meshCount;
  }

  private pollDebugStats(): void {
    if (!this.statsReadbackBuffer || this.isReadingStats) return;
    this.isReadingStats = true;

    this.statsReadbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
      if (!this.statsReadbackBuffer) {
        this.isReadingStats = false;
        return;
      }
      const copyArray = new Uint32Array(this.statsReadbackBuffer.getMappedRange().slice(0));
      this.statsReadbackBuffer.unmap();
      this.isReadingStats = false;

      this.stats.visibleInstances = copyArray[0];
      this.stats.culledInstances = copyArray[1];
    }).catch(() => {
      this.isReadingStats = false;
    });
  }
}
