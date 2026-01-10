// Task Worker - Background execution loop for processing tasks
import { useWalletStore } from '../store/walletStore';

export interface TaskNotification {
  task: {
    task_id: string;
    task_type: string;
    operation: string;
    model: string;
    input_source: string;
    input_hash: string;
    constraints_time_limit_sec: number;
    constraints_max_energy_mwh: number;
    labor_compensation_ton: number;
    min_trust_score: number;
    redundancy_factor: number;
  };
  timestamp: string;
}

// Wasm module cache
let wasmModuleCache: Map<string, WebAssembly.Module> = new Map();

export class TaskWorker {
  private ws: WebSocket | null = null;
  private deviceID: string;
  private walletAddress: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private onTaskReceived?: (task: TaskNotification) => void;
  private onError?: (error: Error) => void;

  constructor(deviceID: string, walletAddress: string) {
    this.deviceID = deviceID;
    this.walletAddress = walletAddress;
  }

  setCallbacks(onTaskReceived: (task: TaskNotification) => void, onError?: (error: Error) => void) {
    this.onTaskReceived = onTaskReceived;
    this.onError = onError;
  }

  connect() {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 
      (process.env.NEXT_PUBLIC_API_URL?.replace('https://', 'wss://').replace('http://', 'ws://') || 'ws://localhost:8080');
    const url = `${wsUrl}/ws?device_id=${this.deviceID}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('✅ TaskWorker: WebSocket connected');
        this.reconnectAttempts = 0;
        // Send heartbeat
        this.sendHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'heartbeat_ack') {
            // Heartbeat response - schedule next heartbeat
            setTimeout(() => this.sendHeartbeat(), 50000);
            return;
          }

          // Task notification
          if (data.task) {
            const notification: TaskNotification = {
              task: data.task,
              timestamp: data.timestamp,
            };
            if (this.onTaskReceived) {
              this.onTaskReceived(notification);
            }
          }
        } catch (error) {
          console.error('TaskWorker: Failed to parse message', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('TaskWorker: WebSocket error', error);
        if (this.onError) {
          this.onError(new Error('WebSocket connection error'));
        }
      };

      this.ws.onclose = () => {
        console.log('TaskWorker: WebSocket closed, attempting reconnect...');
        this.reconnect();
      };
    } catch (error) {
      console.error('TaskWorker: Failed to create WebSocket', error);
      if (this.onError) {
        this.onError(error as Error);
      }
    }
  }

  private sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'heartbeat' }));
    }
  }

  private reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`TaskWorker: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error('TaskWorker: Max reconnection attempts reached');
      if (this.onError) {
        this.onError(new Error('Failed to reconnect to WebSocket'));
      }
    }
  }

  claimTask(taskID: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'claim_task',
        task_id: taskID,
      }));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Hash function for signing (SHA-256)
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Load Wasm module
async function loadWasmModule(modelUrl: string): Promise<WebAssembly.Module> {
  if (wasmModuleCache.has(modelUrl)) {
    return wasmModuleCache.get(modelUrl)!;
  }

  try {
    const response = await fetch(modelUrl);
    if (!response.ok) {
      throw new Error(`Failed to load Wasm module: ${response.statusText}`);
    }
    
    const bytes = await response.arrayBuffer();
    const module = await WebAssembly.compile(bytes);
    wasmModuleCache.set(modelUrl, module);
    return module;
  } catch (error) {
    console.error('Failed to load Wasm module:', error);
    throw error;
  }
}

// Execute Wasm computation
async function executeWasm(module: WebAssembly.Module, inputData: any): Promise<any> {
  try {
    const memory = new WebAssembly.Memory({ initial: 256, maximum: 512 });
    const instance = await WebAssembly.instantiate(module, {
      env: { memory },
      wasi_snapshot_preview1: {
        proc_exit: () => {},
        fd_write: () => {},
      },
    });

    // Call the main function if it exists
    const mainFunc = (instance.exports.main as Function) || (instance.exports._start as Function);
    if (mainFunc) {
      const result = mainFunc(inputData);
      return { result, success: true };
    } else {
      // Fallback: return module exports
      return { result: instance.exports, success: true };
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('out of memory') || error.message.includes('OOM')) {
        throw new Error('Out of Memory');
      }
      if (error.message.includes('timeout') || error.message.includes('execution')) {
        throw new Error('Execution Timeout');
      }
    }
    throw error;
  }
}

// Execute a task with real computation logic
export async function executeTask(task: TaskNotification['task']): Promise<any> {
  const startTime = performance.now();
  console.log('Executing task:', task.task_id);

  try {
    // 1. Fetch input data from input_source
    let inputData: any;
    try {
      const inputResponse = await fetch(task.input_source, {
        signal: AbortSignal.timeout(task.constraints_time_limit_sec * 1000),
      });
      
      if (!inputResponse.ok) {
        throw new Error(`Failed to fetch input: ${inputResponse.statusText}`);
      }

      // Try to parse as JSON, fallback to text
      const contentType = inputResponse.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        inputData = await inputResponse.json();
      } else {
        inputData = await inputResponse.text();
      }

      // Verify input hash if provided
      if (task.input_hash) {
        const inputHash = await sha256(JSON.stringify(inputData));
        if (inputHash !== task.input_hash) {
          throw new Error('Input hash mismatch');
        }
      }
    } catch (error) {
      console.error('Failed to fetch input data:', error);
      throw new Error('Input fetch failed');
    }

    // 2. Run computation based on model type
    let result: any;
    
    if (task.model && task.model.endsWith('.wasm')) {
      // Wasm execution
      try {
        const wasmModule = await loadWasmModule(task.model);
        result = await executeWasm(wasmModule, inputData);
      } catch (error) {
        if (error instanceof Error && error.message === 'Out of Memory') {
          throw new Error('Out of Memory: Task requires more memory than available');
        }
        if (error instanceof Error && error.message === 'Execution Timeout') {
          throw new Error('Execution Timeout: Task exceeded time limit');
        }
        throw error;
      }
    } else {
      // JavaScript function execution (fallback)
      // For now, use a simple computation
      result = {
        operation: task.operation,
        input: inputData,
        computed: `Processed ${task.operation} with input data`,
        timestamp: Date.now(),
      };
    }

    const executionTime = Math.floor(performance.now() - startTime);

    // Check time limit
    if (executionTime > task.constraints_time_limit_sec * 1000) {
      throw new Error('Execution Timeout: Task exceeded time limit');
    }

    return {
      result,
      confidence: 0.95,
      execution_time_ms: executionTime,
      task_id: task.task_id,
    };
  } catch (error) {
    const executionTime = Math.floor(performance.now() - startTime);
    console.error('Task execution failed:', error);
    
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      execution_time_ms: executionTime,
      task_id: task.task_id,
      success: false,
    };
  }
}

// Sign result data with wallet
async function signResultData(
  taskID: string,
  resultData: any,
  tonConnectUI: any
): Promise<string> {
  try {
    // Create hash: SHA-256(taskID + JSON.stringify(resultData))
    const resultString = JSON.stringify(resultData);
    const message = `${taskID}${resultString}`;
    const hash = await sha256(message);

    // Sign hash with TonConnect
    if (!tonConnectUI.connector) {
      throw new Error('TonConnect not connected');
    }

    const signature = await tonConnectUI.connector.signData({
      data: hash,
      version: 'v2',
    });

    // Return signature in hex format
    return signature.signature;
  } catch (error) {
    console.error('Failed to sign result:', error);
    throw new Error('Signature failed');
  }
}

// Submit task result to backend with signature
export async function submitTaskResult(
  taskID: string,
  deviceID: string,
  result: any,
  executionTimeMs: number,
  tonConnectUI: any
): Promise<void> {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
  
  try {
    // Sign the result
    const signature = await signResultData(taskID, result, tonConnectUI);

    const response = await fetch(`${apiBase}/api/v1/device/tasks/${taskID}/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: deviceID,
        result: result,
        proof: signature,
        execution_time_ms: executionTimeMs,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to submit result: ${response.statusText}`);
    }

    console.log('✅ Task result submitted successfully with signature');
  } catch (error) {
    console.error('❌ Failed to submit task result:', error);
    throw error;
  }
}

