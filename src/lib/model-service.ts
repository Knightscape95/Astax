/**
 * Model Service - Handles model forwarding to AWS VM
 * 
 * This service manages the communication between the Next.js app
 * and the AWS VM for model deployment and management.
 */

import { Model, ModelStatus } from '@/types/database';

// ============================================================================
// Types
// ============================================================================

export interface ModelUploadPayload {
  modelId: string;
  name: string;
  version: string;
  algorithm: string;
  targetAsset: string;
  hyperparameters: Record<string, unknown>;
  features: string[];
  fileBuffer: Buffer;
  fileName: string;
  fileSize: number;
  checksum: string;
}

export interface ModelDeploymentResult {
  success: boolean;
  modelId: string;
  deploymentId?: string;
  vmEndpoint?: string;
  status: 'deployed' | 'queued' | 'failed';
  error?: string;
  timestamp: number;
}

export interface ModelStatusUpdate {
  modelId: string;
  status: ModelStatus;
  previousStatus?: ModelStatus;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface VMHealthStatus {
  healthy: boolean;
  latency: number;
  lastChecked: number;
  activeModels: number;
  availableMemory?: number;
  gpuUtilization?: number;
}

// ============================================================================
// Configuration
// ============================================================================

interface ModelServiceConfig {
  vmHttpEndpoint: string;
  vmWsEndpoint: string;
  apiKey: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

const defaultConfig: ModelServiceConfig = {
  vmHttpEndpoint: process.env.AWS_VM_HTTP_ENDPOINT || 'http://localhost:8080',
  vmWsEndpoint: process.env.AWS_VM_WS_ENDPOINT || 'ws://localhost:8081',
  apiKey: process.env.AWS_VM_API_KEY || '',
  timeout: parseInt(process.env.MODEL_UPLOAD_TIMEOUT || '120000', 10),
  retryAttempts: parseInt(process.env.MODEL_RETRY_ATTEMPTS || '3', 10),
  retryDelay: parseInt(process.env.MODEL_RETRY_DELAY || '5000', 10),
};

// ============================================================================
// Model Service Class
// ============================================================================

export class ModelService {
  private config: ModelServiceConfig;
  private wsConnection: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(config: Partial<ModelServiceConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  // ==========================================================================
  // HTTP Methods - Model Upload and Management
  // ==========================================================================

  /**
   * Upload and deploy a model to the AWS VM
   */
  async uploadModel(payload: ModelUploadPayload): Promise<ModelDeploymentResult> {
    const url = `${this.config.vmHttpEndpoint}/api/models/deploy`;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const formData = new FormData();
        
        // Add model metadata
        formData.append('modelId', payload.modelId);
        formData.append('name', payload.name);
        formData.append('version', payload.version);
        formData.append('algorithm', payload.algorithm);
        formData.append('targetAsset', payload.targetAsset);
        formData.append('hyperparameters', JSON.stringify(payload.hyperparameters));
        formData.append('features', JSON.stringify(payload.features));
        formData.append('checksum', payload.checksum);
        
        // Add model file as blob - convert Buffer to Uint8Array for Blob compatibility
        const uint8Array = new Uint8Array(payload.fileBuffer);
        const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
        formData.append('modelFile', blob, payload.fileName);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'X-Request-ID': `upload-${payload.modelId}-${Date.now()}`,
          },
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        return {
          success: true,
          modelId: payload.modelId,
          deploymentId: result.deploymentId,
          vmEndpoint: result.endpoint,
          status: result.status || 'deployed',
          timestamp: Date.now(),
        };
      } catch (error) {
        const isLastAttempt = attempt === this.config.retryAttempts;
        const isAbortError = error instanceof Error && error.name === 'AbortError';
        
        console.error(
          `Model upload attempt ${attempt}/${this.config.retryAttempts} failed:`,
          error
        );

        if (isLastAttempt || isAbortError) {
          return {
            success: false,
            modelId: payload.modelId,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Upload failed',
            timestamp: Date.now(),
          };
        }

        // Wait before retry
        await this.delay(this.config.retryDelay * attempt);
      }
    }

    return {
      success: false,
      modelId: payload.modelId,
      status: 'failed',
      error: 'Max retry attempts exceeded',
      timestamp: Date.now(),
    };
  }

  /**
   * Update model status on AWS VM
   */
  async updateModelStatus(update: ModelStatusUpdate): Promise<boolean> {
    try {
      const url = `${this.config.vmHttpEndpoint}/api/models/${update.modelId}/status`;
      
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          status: update.status,
          previousStatus: update.previousStatus,
          reason: update.reason,
          metadata: update.metadata,
          timestamp: Date.now(),
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to update model status on VM:', error);
      return false;
    }
  }

  /**
   * Remove a model from AWS VM
   */
  async removeModel(modelId: string): Promise<boolean> {
    try {
      const url = `${this.config.vmHttpEndpoint}/api/models/${modelId}`;
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to remove model from VM:', error);
      return false;
    }
  }

  /**
   * Get model status from AWS VM
   */
  async getVMModelStatus(modelId: string): Promise<{
    status: ModelStatus;
    metrics?: Record<string, unknown>;
  } | null> {
    try {
      const url = `${this.config.vmHttpEndpoint}/api/models/${modelId}/status`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get model status from VM:', error);
      return null;
    }
  }

  /**
   * List all models deployed on AWS VM
   */
  async listVMModels(): Promise<{
    modelId: string;
    status: ModelStatus;
    deployedAt: number;
  }[]> {
    try {
      const url = `${this.config.vmHttpEndpoint}/api/models`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Failed to list models from VM:', error);
      return [];
    }
  }

  /**
   * Check VM health status
   */
  async checkVMHealth(): Promise<VMHealthStatus> {
    const startTime = Date.now();
    
    try {
      const url = `${this.config.vmHttpEndpoint}/health`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          healthy: false,
          latency,
          lastChecked: Date.now(),
          activeModels: 0,
        };
      }

      const data = await response.json();
      return {
        healthy: true,
        latency,
        lastChecked: Date.now(),
        activeModels: data.activeModels || 0,
        availableMemory: data.availableMemory,
        gpuUtilization: data.gpuUtilization,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        lastChecked: Date.now(),
        activeModels: 0,
      };
    }
  }

  // ==========================================================================
  // WebSocket Methods - Real-time Communication
  // ==========================================================================

  /**
   * Connect to AWS VM WebSocket for real-time updates
   */
  async connectWebSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if (this.wsConnection?.readyState === WebSocket.OPEN) {
          resolve(true);
          return;
        }

        const url = `${this.config.vmWsEndpoint}?token=${this.config.apiKey}`;
        this.wsConnection = new WebSocket(url);

        this.wsConnection.onopen = () => {
          console.log('Connected to AWS VM WebSocket');
          this.startHealthCheck();
          resolve(true);
        };

        this.wsConnection.onclose = (event) => {
          console.log('AWS VM WebSocket closed:', event.code, event.reason);
          this.stopHealthCheck();
          this.scheduleReconnect();
        };

        this.wsConnection.onerror = (error) => {
          console.error('AWS VM WebSocket error:', error);
          resolve(false);
        };

        this.wsConnection.onmessage = (event) => {
          this.handleWebSocketMessage(event.data);
        };
      } catch (error) {
        console.error('Failed to connect to AWS VM WebSocket:', error);
        resolve(false);
      }
    });
  }

  /**
   * Disconnect from AWS VM WebSocket
   */
  disconnectWebSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHealthCheck();
    
    if (this.wsConnection) {
      this.wsConnection.close(1000, 'Client disconnecting');
      this.wsConnection = null;
    }

    // Reject all pending requests
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('WebSocket disconnected'));
    });
    this.pendingRequests.clear();
  }

  /**
   * Send a message via WebSocket and wait for response
   */
  async sendWebSocketMessage<T>(
    type: string,
    payload: Record<string, unknown>,
    timeoutMs: number = 30000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`WebSocket request timeout: ${type}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      const message = JSON.stringify({
        id: requestId,
        type,
        payload,
        timestamp: Date.now(),
      });

      this.wsConnection.send(message);
    });
  }

  /**
   * Send model deployment request via WebSocket
   */
  async deployModelViaWebSocket(modelId: string): Promise<ModelDeploymentResult> {
    try {
      const result = await this.sendWebSocketMessage<ModelDeploymentResult>(
        'model:deploy',
        { modelId },
        60000
      );
      return result;
    } catch (error) {
      return {
        success: false,
        modelId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'WebSocket deployment failed',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Request model status update via WebSocket
   */
  async requestStatusUpdate(modelId: string): Promise<void> {
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'model:status_request',
        payload: { modelId },
        timestamp: Date.now(),
      });
      this.wsConnection.send(message);
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private handleWebSocketMessage(data: string | Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle response to pending request
      if (message.id && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);
        
        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.payload);
        }
        return;
      }

      // Handle broadcast messages
      switch (message.type) {
        case 'model:status_update':
          this.handleModelStatusUpdate(message.payload);
          break;
        case 'model:metrics':
          this.handleModelMetrics(message.payload);
          break;
        case 'heartbeat':
          this.handleHeartbeat(message.payload);
          break;
        default:
          console.log('Unknown WebSocket message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleModelStatusUpdate(payload: ModelStatusUpdate): void {
    // Emit event or callback for status updates
    console.log('Model status update received:', payload);
  }

  private handleModelMetrics(payload: Record<string, unknown>): void {
    // Emit event or callback for metrics updates
    console.log('Model metrics received:', payload);
  }

  private handleHeartbeat(payload: Record<string, unknown>): void {
    // Respond to heartbeat
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type: 'heartbeat_ack',
        payload: {
          clientTime: Date.now(),
          serverTime: payload.serverTime,
        },
      }));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, this.config.retryDelay);
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      const health = await this.checkVMHealth();
      if (!health.healthy) {
        console.warn('AWS VM health check failed');
      }
    }, 60000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate MD5 checksum for file verification
 */
export async function calculateChecksum(buffer: Buffer): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Validate ONNX file format
 */
export function validateONNXFile(buffer: Buffer): {
  valid: boolean;
  error?: string;
  metadata?: {
    version?: number;
    producerName?: string;
    graphName?: string;
  };
} {
  // ONNX files start with magic bytes
  // The first few bytes should indicate protobuf format
  
  if (buffer.length < 8) {
    return { valid: false, error: 'File too small to be a valid ONNX model' };
  }

  // Basic validation - check for protobuf structure
  // ONNX models are serialized protobuf files
  // A more thorough validation would parse the protobuf
  
  // Check for common ONNX markers
  const headerStr = buffer.toString('utf8', 0, Math.min(100, buffer.length));
  
  // ONNX files typically have these markers in the header region
  const hasOnnxMarkers = 
    buffer[0] === 0x08 || // Protobuf field indicator
    headerStr.includes('onnx') ||
    headerStr.includes('ONNX') ||
    headerStr.includes('pytorch') ||
    headerStr.includes('tensorflow');

  if (!hasOnnxMarkers && buffer[0] !== 0x08 && buffer[0] !== 0x0a) {
    return { 
      valid: false, 
      error: 'File does not appear to be a valid ONNX model format' 
    };
  }

  return {
    valid: true,
    metadata: {
      // In a production environment, you would parse the protobuf
      // to extract actual metadata
    },
  };
}

/**
 * Get file extension
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Check if file is an ONNX model
 */
export function isONNXFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ext === 'onnx';
}

// ============================================================================
// Singleton Instance
// ============================================================================

let modelServiceInstance: ModelService | null = null;

export function getModelService(): ModelService {
  if (!modelServiceInstance) {
    modelServiceInstance = new ModelService();
  }
  return modelServiceInstance;
}

export default ModelService;
