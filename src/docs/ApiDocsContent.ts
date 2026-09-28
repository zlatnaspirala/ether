/**
 * Destroyer Engine - Comprehensive API Documentation Data
 */

export interface DocSection {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  codeSnippet?: string;
  diagram?: string[];
}

export const API_DOCS_SECTIONS: DocSection[] = [
  {
    id: 'architecture-overview',
    title: 'Core Architecture & Flat System',
    category: 'Architecture',
    summary: 'Data-Oriented Design (DoD) utilizing contiguous typed arrays and mega-buffers instead of traditional scene graphs.',
    content: `
Destroyer is engineered from the ground up to eliminate CPU-side rendering bottlenecks. Traditional 3D engines traverse deep scene graph hierarchies with thousands of object instances, creating severe cache misses and per-draw state validation overhead.

### The Flat Data Solution
In Destroyer, entities do NOT exist as individual JavaScript class instances. Instead:
- **Transforms & Matrices**: Stored in a flat, contiguous \`Float32Array\` with 24 floats (96 bytes) per entity.
- **Unified Mega Buffers**: All meshes are packed into a single GPU vertex buffer and index buffer.
- **Zero Garbage Collection Spikes**: No memory is allocated or freed during frame rendering; transforms are updated directly inside typed arrays.
- **Compute Stream Compaction**: The GPU frustum culler tests all active bounding spheres in parallel and directly emits compacted instance counts to the indirect arguments buffer.
    `,
    diagram: [
      'CPU Flat Memory (Float32Array)  -->  Direct GPU Storage Buffer Copy',
      'Compute Pass (Culling + Subgroups) -->  drawCommands[meshId].instanceCount',
      'Render Pass  -->  drawIndexedIndirect(indirectBuffer, meshOffset)'
    ],
    codeSnippet: `// Flat Entity Creation & Storage Buffer Streaming
const engine = new DestroyerEngine();
await engine.init({ canvas, enableSubgroups: true });

// Register material (stored in flat 16-float array)
const matId = engine.entityManager.registerMaterial({
  baseColor: [0.2, 0.8, 1.0, 1.0],
  emissiveColor: [0.0, 0.4, 0.8, 1.0],
  roughness: 0.15,
  metallic: 0.9,
  ao: 1.0,
  alphaCutoff: 0.5
});

// Create 10,000 entities in flat contiguous memory
for (let i = 0; i < 10000; i++) {
  engine.entityManager.createEntity(
    meshId,
    matId,
    [x, y, z],       // Position
    [0, 0, 0, 1],    // Quaternion Rotation
    [1, 1, 1],       // Scale
    2.5              // Bounding Radius
  );
}`
  },
  {
    id: 'indirect-draws',
    title: 'GPU Indirect Draws Pipeline',
    category: 'Rendering',
    summary: 'Hardware-accelerated drawIndexedIndirect driven by GPU compute culling with zero CPU draw overhead.',
    content: `
Traditional rendering requires the CPU to iterate through visible meshes and issue distinct draw calls: \`passEncoder.drawIndexed(indexCount, instanceCount, ...)\`.

With Destroyer's **Indirect Draw Pipeline**:
1. **Draw Command Struct**: The GPU maintains a 5 x \`uint32\` (20 bytes) command buffer per mesh:
   \`[indexCount, instanceCount, firstIndex, baseVertex, firstInstance]\`.
2. **Clear Pass**: A compute pass resets \`instanceCount\` to 0.
3. **Culling Pass**: Each GPU compute thread evaluates an entity's bounding sphere against 6 camera frustum planes. If inside, it atomically increments \`drawCommands[meshId].instanceCount\` and writes the entity's ID to \`visibleIndices\`.
4. **Execution**: The render pass calls \`drawIndexedIndirect(indirectBuffer, offset)\`. The CPU never inspects the visibility count!
    `,
    codeSnippet: `// Render Pass: Multi-Mesh drawIndexedIndirect
const meshCount = entityManager.meshRegistry.length;

renderPass.setPipeline(this.renderPipeline);
renderPass.setBindGroup(0, this.renderBindGroup);
renderPass.setVertexBuffer(0, this.vertexBuffer);
renderPass.setIndexBuffer(this.indexBuffer, 'uint32');

// 1 draw call per distinct mesh, instances managed entirely on GPU
for (let m = 0; m < meshCount; m++) {
  const indirectOffset = m * 20; // 5 uint32 * 4 bytes = 20 bytes
  renderPass.drawIndexedIndirect(this.indirectBuffer, indirectOffset);
}`
  },
  {
    id: 'subgroups-compaction',
    title: 'WebGPU Subgroups Optimization',
    category: 'Hardware Acceleration',
    summary: 'Using WGSL subgroups intrinsics to eliminate warp-level atomic contention during frustum culling.',
    content: `
Subgroups represent the hardware SIMD execution units (Warps on NVIDIA, Wavefronts on AMD/Apple Silicon, Subgroups on Intel).

### Why Subgroups Matter for Culling
When 50,000 threads simultaneously call \`atomicAdd\` on the same memory address, massive memory pipeline stalls occur.
With the \`enable subgroups;\` WGSL extension:
- **subgroupBallot**: Gathers a 64-bit mask of which threads in the subgroup passed the frustum culling test.
- **subgroupAdd**: Sums all visible instances within the physical wave locally inside registers.
- **subgroupElect**: Only a single representative thread in the entire subgroup touches atomic global memory.

Destroyer detects whether the user's adapter features include \`'subgroups'\` and automatically negotiates the accelerated WGSL shader, with an automatic fallback for standard devices.
    `,
    codeSnippet: `// Excerpt from CULLING_SUBGROUPS_WGSL
enable subgroups;

@compute @workgroup_size(64, 1, 1)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(subgroup_invocation_id) lane_id: u32,
  @builtin(subgroup_size) sg_size: u32
) {
  let index = global_id.x;
  var isVisible = false;
  
  if (index < camera.totalEntities) {
    let worldPos = (entities[index].worldMatrix * vec4<f32>(entities[index].sphereCenter.xyz, 1.0)).xyz;
    isVisible = testSphereFrustum(worldPos, entities[index].sphereCenter.w);
  }

  // SIMD warp reduction before global memory write
  let visibleInSubgroup = subgroupAdd(select(0u, 1u, isVisible));
  
  if (isVisible) {
    let slot = atomicAdd(&drawCommands[targetMesh].instanceCount, 1u);
    visibleIndices[targetMesh * 32768u + slot] = index;
  }
}`
  },
  {
    id: 'vertex-animation',
    title: 'Vertex Animation Pipeline',
    category: 'Animation',
    summary: 'Dual GPU vertex animation architecture: Skeletal Skinning + Morph Targets + Procedural Wave simulation.',
    content: `
Destroyer provides three high-performance vertex animation pipelines executing directly inside the vertex shader:

### 1. GPU Morph Targets (Blend Shapes)
Mesh primitives can contain multiple morph target deltas (\`deltaPositions\`).
The vertex shader dynamically blends up to 4 morph targets simultaneously:
\`\`\`wgsl
localPos += in.morphPos0 * engine.morphWeight0 + in.morphPos1 * engine.morphWeight1;
\`\`\`

### 2. Skeletal Skinning
Bone joint matrices are stored in a contiguous \`GPUBufferUsage.STORAGE\` buffer. Vertices are weighted with \`JOINTS_0\` (vec4u) and \`WEIGHTS_0\` (vec4f):
\`\`\`wgsl
let skinMat = m0 * in.weights.x + m1 * in.weights.y + m2 * in.weights.z + m3 * in.weights.w;
modelPos = (skinMat * vec4<f32>(localPos, 1.0)).xyz;
\`\`\`

### 3. Procedural Harmonic Waves
GPU vertex displacement running in WGSL with harmonic frequencies, ideal for ocean waves, flags, and forcefields.
    `,
    codeSnippet: `// Controlling Vertex Animations via API
const engine = new DestroyerEngine();

// 1. Morph Targets: Adjust weights smoothly
engine.animation.setMorphWeight(0, 0.75); // Spike expansion
engine.animation.setMorphWeight(1, 0.30); // Twist deformation

// 2. Skeletal Animation Clips
engine.animation.playClip(0); // Plays walking / combat cycle
engine.animation.playbackSpeed = 1.25;

// 3. Procedural Wave Factor
engine.animation.waveFactor = 0.8;`
  },
  {
    id: 'glb-loader',
    title: 'Binary GLB (glTF 2.0) Parser',
    category: 'Asset Pipeline',
    summary: 'Pure TypeScript, zero-dependency glTF 2.0 binary parser with direct flat buffer ingestion.',
    content: `
The \`GLBLoader\` reads binary \`.glb\` files directly in memory:
1. Validates 12-byte header (\`magic: 0x46546C67\`, \`version: 2\`).
2. Extracts JSON and binary BIN chunks.
3. Decodes Accessors and BufferViews with standard component types:
   - \`FLOAT\` (5126), \`UNSIGNED_SHORT\` (5123), \`UNSIGNED_INT\` (5125), \`UNSIGNED_BYTE\` (5121).
4. Extracts Mesh Primitives: Positions, Normals, UVs, Indices, Joints, Skinning Weights, Morph Targets.
5. Ingests PBR Metallic-Roughness material definitions.
6. Packages data into the unified mega vertex/index buffers.
    `,
    codeSnippet: `// Loading a GLB File (Browser Drag-and-Drop or Fetch)
const response = await fetch('/assets/models/character.glb');
const arrayBuffer = await response.arrayBuffer();

// Parse and spawn into flat engine
const { meshIds, primitiveCount } = engine.loadGLB(arrayBuffer);
console.log(\`Loaded \${primitiveCount} primitives into flat entity manager\`);`
  },
  {
    id: 'api-reference',
    title: 'TypeScript API Reference',
    category: 'API Reference',
    summary: 'Complete reference for DestroyerEngine, FlatEntityManager, Camera, and VertexAnimationController.',
    content: `
### DestroyerEngine
- \`init(config: DestroyerConfig): Promise<{ success: boolean; error?: string }>\`
- \`start(): void\` / \`stop(): void\`
- \`resize(width: number, height: number): void\`
- \`loadGLB(arrayBuffer: ArrayBuffer): { meshIds: number[]; primitiveCount: number }\`
- \`loadScenePreset(preset: string, instanceCount?: number): void\`
- \`getStats(): EngineStats\`

### FlatEntityManager
- \`createEntity(meshId, materialId, position, rotation, scale, radius, animOffset): number\`
- \`updateTransform(id, position, rotation, scale): void\`
- \`registerMaterial(mat: FlatMaterial): number\`
- \`registerMesh(metadata: Omit<MeshMetadata, 'id'>): number\`
- \`clear(): void\`

### Camera
- \`orbit(deltaTheta: number, deltaPhi: number): void\`
- \`pan(deltaX: number, deltaY: number): void\`
- \`zoom(deltaRadius: number): void\`
- \`toggleFrustumFreeze(): boolean\`
    `,
    codeSnippet: `import { DestroyerEngine } from './engine/DestroyerEngine';

const engine = new DestroyerEngine();
await engine.init({
  canvas: document.getElementById('renderCanvas') as HTMLCanvasElement,
  enableSubgroups: true,
  enableCulling: true,
  maxInstances: 50000
});

// Launch render loop
engine.start();`
  }
];
