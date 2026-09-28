/**
 * Destroyer Engine - Ultimate Flat PBR Render Pipeline WGSL
 * Features:
 * - Indirect Draw Instancing via visible indices storage buffer
 * - Dual Vertex Animation: Skeletal Skinning (Joint Matrices) + GPU Morph Targets (Delta Positions)
 * - Procedural Vertex Displacement / Wave Animation mode
 * - Physically-Based Rendering (Cook-Torrance GGX + Lambertian + Emissive)
 * - Real-time Shader Debug Modes (PBR, Normals, Joints Heatmap, UVs, Ambient Occlusion)
 */

export const RENDER_PIPELINE_WGSL = /* wgsl */ `
struct CameraUniforms {
  viewProj: mat4x4<f32>,
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  camPos: vec4<f32>,
  frustumPlanes: array<vec4<f32>, 6>,
  cullingEnabled: u32,
  totalEntities: u32,
  pad0: u32,
  pad1: u32,
};

struct EntityData {
  worldMatrix: mat4x4<f32>,
  sphereCenter: vec4<f32>,
  meshId: u32,
  materialId: u32,
  flags: u32,
  animOffset: u32,
};

struct MaterialData {
  baseColor: vec4<f32>,      // r, g, b, a
  emissiveColor: vec4<f32>,  // r, g, b, intensity
  roughness: f32,
  metallic: f32,
  ao: f32,
  alphaCutoff: f32,
  flags: u32,
  pad1: f32,
  pad2: f32,
  pad3: f32,
};

struct EngineParams {
  time: f32,
  debugMode: u32, // 0: PBR, 1: Normals, 2: UVs, 3: Skinning Weights, 4: Flat Mesh ID, 5: Roughness
  waveFactor: f32,
  morphWeight0: f32,
  morphWeight1: f32,
  morphWeight2: f32,
  lightDir: vec4<f32>,
  lightColor: vec4<f32>,
  ambientColor: vec4<f32>,
};

// Bind Group 0: Frame & Global Engine state
@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> engine: EngineParams;
@group(0) @binding(2) var<storage, read> entities: array<EntityData>;
@group(0) @binding(3) var<storage, read> materials: array<MaterialData>;
@group(0) @binding(4) var<storage, read> visibleIndices: array<u32>;
@group(0) @binding(5) var<storage, read> jointMatrices: array<mat4x4<f32>>;

// Vertex Input Attributes
struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) joints: vec4<u32>,
  @location(4) weights: vec4<f32>,
  @location(5) morphPos0: vec3<f32>,
  @location(6) morphPos1: vec3<f32>,
  @builtin(instance_index) instanceIndex: u32,
};

struct VertexOutput {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) @interpolate(flat) materialId: u32,
  @location(4) @interpolate(flat) entityIndex: u32,
  @location(5) skinWeightDebug: vec3<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;

  // Retrieve actual entity index from visibleIndices buffer (using mesh offset + instanceIndex)
  // In indirect draw, each mesh draw call gets instance_index in [0, instanceCount - 1]
  // We locate entity index through the visibleInstances lookup table
  let visibleOffset = in.instanceIndex;
  var entityIdx = 0u;
  if (visibleOffset < arrayLength(&visibleIndices)) {
    entityIdx = visibleIndices[visibleOffset];
  }
  let entity = entities[entityIdx];
  out.materialId = entity.materialId;
  out.entityIndex = entityIdx;
  out.uv = in.uv;

  // 1. Morph Target Vertex Animation
  var localPos = in.position;
  var localNormal = in.normal;

  // Blend morph deltas
  if (engine.morphWeight0 > 0.001) {
    localPos += in.morphPos0 * engine.morphWeight0;
  }
  if (engine.morphWeight1 > 0.001) {
    localPos += in.morphPos1 * engine.morphWeight1;
  }

  // 2. Procedural Wave Vertex Animation (if active)
  if (engine.waveFactor > 0.001) {
    let wave1 = sin(localPos.x * 2.5 + engine.time * 3.0) * cos(localPos.z * 2.5 + engine.time * 2.5);
    let wave2 = sin((localPos.x + localPos.z) * 4.0 + engine.time * 4.0) * 0.35;
    localPos.y += (wave1 + wave2) * engine.waveFactor * 0.4;
  }

  // 3. Skeletal Skinning Vertex Animation
  let totalWeight = in.weights.x + in.weights.y + in.weights.z + in.weights.w;
  var modelPos = localPos;
  var modelNormal = localNormal;
  out.skinWeightDebug = in.weights.xyz;

  if (totalWeight > 0.001) {
    let jointOffset = entity.animOffset;
    let m0 = jointMatrices[jointOffset + in.joints.x];
    let m1 = jointMatrices[jointOffset + in.joints.y];
    let m2 = jointMatrices[jointOffset + in.joints.z];
    let m3 = jointMatrices[jointOffset + in.joints.w];

    let skinMat = m0 * in.weights.x +
                  m1 * in.weights.y +
                  m2 * in.weights.z +
                  m3 * in.weights.w;

    modelPos = (skinMat * vec4<f32>(localPos, 1.0)).xyz;
    modelNormal = normalize((skinMat * vec4<f32>(localNormal, 0.0)).xyz);
  }

  // 4. Transform to World Space
  let worldPos4 = entity.worldMatrix * vec4<f32>(modelPos, 1.0);
  out.worldPos = worldPos4.xyz;

  // Transform normal with 3x3 normal matrix (extract rotation & scale from world matrix)
  let normalMat = mat3x3<f32>(
    entity.worldMatrix[0].xyz,
    entity.worldMatrix[1].xyz,
    entity.worldMatrix[2].xyz
  );
  out.worldNormal = normalize(normalMat * modelNormal);

  // 5. Projection to Clip Space
  out.clipPos = camera.viewProj * worldPos4;

  return out;
}

const PI: f32 = 3.14159265359;

// GGX / Trowbridge-Reitz normal distribution function
fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;
  let denom = (NdotH2 * (a2 - 1.0) + 1.0);
  return a2 / (PI * denom * denom + 0.00001);
}

// Schlick-GGX geometry shadowing
fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k + 0.00001);
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  let ggx2 = geometrySchlickGGX(NdotV, roughness);
  let ggx1 = geometrySchlickGGX(NdotL, roughness);
  return ggx1 * ggx2;
}

// Fresnel-Schlick approximation
fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let mat = materials[in.materialId];

  // Debug visualizer modes
  if (engine.debugMode == 1u) {
    // Normal inspection
    return vec4<f32>(in.worldNormal * 0.5 + 0.5, 1.0);
  }
  if (engine.debugMode == 2u) {
    // UV inspection
    return vec4<f32>(fract(in.uv.x), fract(in.uv.y), 0.5, 1.0);
  }
  if (engine.debugMode == 3u) {
    // Skinning Weights Heatmap
    return vec4<f32>(in.skinWeightDebug, 1.0);
  }
  if (engine.debugMode == 4u) {
    // Flat Entity ID coloring
    let hash = sin(f32(in.entityIndex) * 12.9898 + 78.233) * 43758.5453;
    let r = fract(hash);
    let g = fract(hash * 1.345);
    let b = fract(hash * 2.789);
    return vec4<f32>(r * 0.7 + 0.3, g * 0.7 + 0.3, b * 0.7 + 0.3, 1.0);
  }
  if (engine.debugMode == 5u) {
    // Roughness inspection
    return vec4<f32>(vec3<f32>(mat.roughness), 1.0);
  }

  // Physically Based Lighting (PBR)
  let albedo = mat.baseColor.rgb;
  let roughness = clamp(mat.roughness, 0.04, 1.0);
  let metallic = clamp(mat.metallic, 0.0, 1.0);

  let N = normalize(in.worldNormal);
  let V = normalize(camera.camPos.xyz - in.worldPos);

  // Dielectric specular base reflect F0 (0.04), metal uses albedo
  var F0 = vec3<f32>(0.04);
  F0 = mix(F0, albedo, metallic);

  // Directional Key Light
  let L = normalize(-engine.lightDir.xyz);
  let H = normalize(V + L);
  let NdotL = max(dot(N, L), 0.0);

  // Cook-Torrance Specular BRDF
  let NDF = distributionGGX(N, H, roughness);
  let G = geometrySmith(N, V, L, roughness);
  let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  let numerator = NDF * G * F;
  let denominator = 4.0 * max(dot(N, V), 0.0) * NdotL + 0.0001;
  let specular = numerator / denominator;

  let kS = F;
  var kD = vec3<f32>(1.0) - kS;
  kD *= 1.0 - metallic;

  let radiance = engine.lightColor.rgb * engine.lightColor.a;
  let Lo = (kD * albedo / PI + specular) * radiance * NdotL;

  // Secondary soft bounce fill light (from opposite direction)
  let L_fill = normalize(vec3<f32>(-L.x, 0.4, -L.z));
  let NdotL_fill = max(dot(N, L_fill), 0.0) * 0.25;
  let fillLight = albedo * engine.ambientColor.rgb * NdotL_fill;

  // Ambient lighting with AO
  let ambient = engine.ambientColor.rgb * albedo * mat.ao;

  // Emissive contribution
  let emissive = mat.emissiveColor.rgb * mat.emissiveColor.a;

  var color = ambient + Lo + fillLight + emissive;

  // HDR Reinhard tone-mapping & Gamma 2.2 correction
  color = color / (color + vec3<f32>(1.0));
  color = pow(color, vec3<f32>(1.0 / 2.2));

  return vec4<f32>(color, mat.baseColor.a);
}
`;
