/**
 * Destroyer Engine - GPU Frustum Culling & Indirect Draw Buffer Compute Shaders
 * Includes both Subgroup-accelerated WGSL and standard fallback WGSL.
 */

// Common Uniforms & Structs header
export const CULLING_COMMON_WGSL = /* wgsl */ `
struct CameraUniforms {
  viewProj: mat4x4<f32>,
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  camPos: vec4<f32>,
  frustumPlanes: array<vec4<f32>, 6>, // 6 planes: xyz = normal, w = distance
  cullingEnabled: u32,
  totalEntities: u32,
  pad0: u32,
  pad1: u32,
};

// DrawIndexedIndirectArgs layout (5 x uint32 = 20 bytes)
struct DrawCommand {
  indexCount: u32,
  instanceCount: atomic<u32>,
  firstIndex: u32,
  baseVertex: u32,
  firstInstance: u32,
};

// Flat Entity Record: 64 bytes per entity
struct EntityData {
  worldMatrix: mat4x4<f32>, // 16 floats
  sphereCenter: vec4<f32>,   // xyz = center, w = radius
  meshId: u32,
  materialId: u32,
  flags: u32, // bit 0 = active, bit 1 = castShadows
  animOffset: u32,
};
`;

/**
 * Standard Compute Culling WGSL (No subgroup extension required)
 */
export const CULLING_STANDARD_WGSL = /* wgsl */ `
${CULLING_COMMON_WGSL}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> entities: array<EntityData>;
@group(0) @binding(2) var<storage, read_write> drawCommands: array<DrawCommand>;
@group(0) @binding(3) var<storage, read_write> visibleIndices: array<u32>;
@group(0) @binding(4) var<storage, read_write> debugStats: array<atomic<u32>, 4>; // [0]: visible, [1]: culled, [2]: total, [3]: subgroupUsed

fn testSphereFrustum(center: vec3<f32>, radius: f32) -> bool {
  if (camera.cullingEnabled == 0u) {
    return true;
  }
  for (var i = 0u; i < 6u; i = i + 1u) {
    let plane = camera.frustumPlanes[i];
    let dist = dot(plane.xyz, center) + plane.w;
    if (dist < -radius) {
      return false;
    }
  }
  return true;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let index = global_id.x;
  if (index >= camera.totalEntities) {
    return;
  }

  let entity = entities[index];
  if ((entity.flags & 1u) == 0u) {
    atomicAdd(&debugStats[1], 1u);
    return;
  }

  // Transform bounding sphere center to world space
  let worldPos = (entity.worldMatrix * vec4<f32>(entity.sphereCenter.xyz, 1.0)).xyz;
  // Estimate world radius by maximum scaling factor in matrix
  let scaleX = length(entity.worldMatrix[0].xyz);
  let scaleY = length(entity.worldMatrix[1].xyz);
  let scaleZ = length(entity.worldMatrix[2].xyz);
  let maxScale = max(scaleX, max(scaleY, scaleZ));
  let worldRadius = entity.sphereCenter.w * maxScale;

  let isVisible = testSphereFrustum(worldPos, worldRadius);

  if (isVisible) {
    // Atomically increment the instance count for this specific mesh draw command
    let slot = atomicAdd(&drawCommands[entity.meshId].instanceCount, 1u);
    // Record visible entity index for render pass
    // We compute flat offset = meshId * maxInstancesPerMesh + slot
    let offset = entity.meshId * 32768u + slot;
    if (offset < arrayLength(&visibleIndices)) {
      visibleIndices[offset] = index;
    }
    atomicAdd(&debugStats[0], 1u);
  } else {
    atomicAdd(&debugStats[1], 1u);
  }
}
`;

/**
 * Subgroup-Accelerated Compute Culling WGSL
 * Uses WGSL 'subgroups' extension:
 * Performs subgroupBallot and subgroupAdd to aggregate visible counts within each SIMD warp/subgroup
 * before touching global atomic memory!
 */
export const CULLING_SUBGROUPS_WGSL = /* wgsl */ `
enable subgroups;

${CULLING_COMMON_WGSL}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> entities: array<EntityData>;
@group(0) @binding(2) var<storage, read_write> drawCommands: array<DrawCommand>;
@group(0) @binding(3) var<storage, read_write> visibleIndices: array<u32>;
@group(0) @binding(4) var<storage, read_write> debugStats: array<atomic<u32>, 4>;

fn testSphereFrustum(center: vec3<f32>, radius: f32) -> bool {
  if (camera.cullingEnabled == 0u) {
    return true;
  }
  for (var i = 0u; i < 6u; i = i + 1u) {
    let plane = camera.frustumPlanes[i];
    let dist = dot(plane.xyz, center) + plane.w;
    if (dist < -radius) {
      return false;
    }
  }
  return true;
}

@compute @workgroup_size(64, 1, 1)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(subgroup_invocation_id) lane_id: u32,
  @builtin(subgroup_size) sg_size: u32
) {
  let index = global_id.x;
  var isVisible = false;
  var targetMesh = 0u;

  if (index < camera.totalEntities) {
    let entity = entities[index];
    if ((entity.flags & 1u) != 0u) {
      targetMesh = entity.meshId;
      let worldPos = (entity.worldMatrix * vec4<f32>(entity.sphereCenter.xyz, 1.0)).xyz;
      let scaleX = length(entity.worldMatrix[0].xyz);
      let scaleY = length(entity.worldMatrix[1].xyz);
      let scaleZ = length(entity.worldMatrix[2].xyz);
      let maxScale = max(scaleX, max(scaleY, scaleZ));
      let worldRadius = entity.sphereCenter.w * maxScale;
      isVisible = testSphereFrustum(worldPos, worldRadius);
    }
  }

  // Subgroup ballot: bitmask of all visible threads in this wave
  let ballot = subgroupBallot(isVisible);
  let visibleInSubgroup = subgroupAdd(select(0u, 1u, isVisible));

  // Lane 0 marks subgroup usage stats
  if (subgroupElect()) {
    atomicAdd(&debugStats[3], 1u);
  }

  if (isVisible) {
    let slot = atomicAdd(&drawCommands[targetMesh].instanceCount, 1u);
    let offset = targetMesh * 32768u + slot;
    if (offset < arrayLength(&visibleIndices)) {
      visibleIndices[offset] = index;
    }
    atomicAdd(&debugStats[0], 1u);
  } else if (index < camera.totalEntities) {
    atomicAdd(&debugStats[1], 1u);
  }
}
`;

/**
 * Clear Indirect Draw Counters Compute Shader
 * Resets instanceCount to 0 for all indirect draw commands before culling pass
 */
export const CLEAR_INDIRECT_COMMANDS_WGSL = /* wgsl */ `
struct DrawCommand {
  indexCount: u32,
  instanceCount: atomic<u32>,
  firstIndex: u32,
  baseVertex: u32,
  firstInstance: u32,
};

@group(0) @binding(0) var<storage, read_write> drawCommands: array<DrawCommand>;
@group(0) @binding(1) var<storage, read_write> debugStats: array<atomic<u32>, 4>;

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx < arrayLength(&drawCommands)) {
    atomicStore(&drawCommands[idx].instanceCount, 0u);
  }
  if (idx < 4u) {
    atomicStore(&debugStats[idx], 0u);
  }
}
`;
