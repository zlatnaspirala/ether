/**
 * Destroyer Engine - WebGPU Device & Adapter Manager
 * Handles subgroup feature detection, canvas context configuration, and resilience.
 */

export interface DeviceInitResult {
  device: GPUDevice;
  adapter: GPUAdapter;
  format: GPUTextureFormat;
  subgroupsSupported: boolean;
  subgroupMinSize: number;
  subgroupMaxSize: number;
  error?: string;
}

export class DeviceManager {
  private static instance: DeviceManager | null = null;
  public adapter: GPUAdapter | null = null;
  public device: GPUDevice | null = null;
  public format: GPUTextureFormat = 'bgra8unorm';
  public subgroupsSupported = false;
  public subgroupMinSize = 0;
  public subgroupMaxSize = 0;

  static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  async init(enableSubgroups = true): Promise<DeviceInitResult> {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      return {
        device: null as unknown as GPUDevice,
        adapter: null as unknown as GPUAdapter,
        format: 'bgra8unorm',
        subgroupsSupported: false,
        subgroupMinSize: 0,
        subgroupMaxSize: 0,
        error: 'WebGPU is not supported in this browser. Please use Chrome 113+, Edge 113+, Firefox Nightly, or Safari 18+ with WebGPU enabled.'
      };
    }

    try {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });

      if (!adapter) {
        return {
          device: null as unknown as GPUDevice,
          adapter: null as unknown as GPUAdapter,
          format: 'bgra8unorm',
          subgroupsSupported: false,
          subgroupMinSize: 0,
          subgroupMaxSize: 0,
          error: 'Failed to find a compatible WebGPU adapter. Please check your GPU hardware acceleration settings.'
        };
      }

      this.adapter = adapter;

      // Check for WebGPU Subgroups feature
      const hasSubgroups = adapter.features.has('subgroups');
      const requiredFeatures: GPUFeatureName[] = [];
      if (hasSubgroups && enableSubgroups) {
        requiredFeatures.push('subgroups' as GPUFeatureName);
        this.subgroupsSupported = true;
      } else {
        this.subgroupsSupported = false;
      }

      // Request device with requested features
      const device = await adapter.requestDevice({
        requiredFeatures,
        requiredLimits: {
          maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
          maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
        }
      });

      this.device = device;
      this.format = navigator.gpu.getPreferredCanvasFormat();

      // Read subgroup limits if available
      this.subgroupMinSize = (adapter.limits as unknown as { minSubgroupSize?: number }).minSubgroupSize || (this.subgroupsSupported ? 32 : 0);
      this.subgroupMaxSize = (adapter.limits as unknown as { maxSubgroupSize?: number }).maxSubgroupSize || (this.subgroupsSupported ? 64 : 0);

      device.lost.then((info) => {
        console.warn(`Destroyer WebGPU device lost: ${info.message} (reason: ${info.reason})`);
      });

      return {
        device,
        adapter,
        format: this.format,
        subgroupsSupported: this.subgroupsSupported,
        subgroupMinSize: this.subgroupMinSize,
        subgroupMaxSize: this.subgroupMaxSize,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        device: null as unknown as GPUDevice,
        adapter: null as unknown as GPUAdapter,
        format: 'bgra8unorm',
        subgroupsSupported: false,
        subgroupMinSize: 0,
        subgroupMaxSize: 0,
        error: `WebGPU Initialization Error: ${msg}`
      };
    }
  }

  configureCanvas(canvas: HTMLCanvasElement): GPUCanvasContext {
    if (!this.device) {
      throw new Error('Device not initialized before configuring canvas');
    }
    const context = canvas.getContext('webgpu') as GPUCanvasContext;
    if (!context) {
      throw new Error('Failed to obtain webgpu canvas context');
    }
    context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque'
    });
    return context;
  }
}
