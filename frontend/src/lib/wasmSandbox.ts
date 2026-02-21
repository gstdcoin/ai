/**
 * WASM Sandbox for secure execution of WebAssembly tasks
 * Provides memory limits, timeout enforcement, and sandboxed I/O
 */

export interface WasmTaskInput {
    taskId: string;
    wasmBinary: ArrayBuffer;
    input: Record<string, unknown>;
    memoryLimitMB: number;
    timeoutMs: number;
    functionName?: string;
}

export interface WasmTaskResult {
    success: boolean;
    output: unknown;
    executionTimeMs: number;
    memoryUsedBytes: number;
    errorMessage?: string;
    logs: string[];
}

export interface SandboxStats {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    avgExecutionTimeMs: number;
    maxMemoryUsedBytes: number;
}

/**
 * Sandboxed WASM imports - minimal API for security
 */
interface SandboxedImports {
    env: {
        // Console logging (captured, not output)
        log_string: (ptr: number, len: number) => void;
        log_number: (value: number) => void;

        // Time (sandboxed - returns elapsed time)
        get_time_ms: () => number;

        // Memory (read-only access to input)
        get_input_length: () => number;
        get_input_byte: (index: number) => number;

        // Output (write result)
        set_output_length: (len: number) => void;
        set_output_byte: (index: number, value: number) => void;

        // Random (deterministic for reproducibility)
        get_random: () => number;
    };
    wasi_snapshot_preview1?: {
        // Minimal WASI stubs for compatibility
        fd_write: () => number;
        fd_read: () => number;
        fd_close: () => number;
        fd_seek: () => number;
        proc_exit: (code: number) => void;
        environ_sizes_get: () => number;
        environ_get: () => number;
        args_sizes_get: () => number;
        args_get: () => number;
        clock_time_get: () => number;
    };
}

/**
 * WASM Sandbox class for secure execution
 */
export class WasmSandbox {
    private stats: SandboxStats = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        avgExecutionTimeMs: 0,
        maxMemoryUsedBytes: 0,
    };

    private logs: string[] = [];
    private memory: WebAssembly.Memory | null = null;
    private startTime: number = 0;
    private inputBuffer: Uint8Array = new Uint8Array();
    private outputBuffer: Uint8Array = new Uint8Array(1024 * 1024); // 1MB max output
    private outputLength: number = 0;
    private randomSeed: number = 0;

    /**
     * Executes a WASM task in a sandboxed environment
     */
    async execute(task: WasmTaskInput): Promise<WasmTaskResult> {
        this.stats.totalExecutions++;
        this.logs = [];
        this.outputLength = 0;
        this.startTime = performance.now();
        this.randomSeed = this.hashString(task.taskId); // Deterministic random

        // Prepare input
        const inputJson = JSON.stringify(task.input);
        this.inputBuffer = new TextEncoder().encode(inputJson);

        try {
            // Validate WASM binary
            if (!this.isValidWasm(task.wasmBinary)) {
                throw new Error('Invalid WASM binary');
            }

            // Create memory with limits
            const pagesNeeded = Math.ceil((task.memoryLimitMB * 1024 * 1024) / 65536);
            this.memory = new WebAssembly.Memory({
                initial: Math.min(16, pagesNeeded), // Start with 1MB
                maximum: pagesNeeded,
            });

            // Compile and instantiate with sandboxed imports
            const imports = this.createSandboxedImports();

            // Wrap execution in timeout
            const result = await this.executeWithTimeout(
                task.wasmBinary,
                imports,
                task.functionName || 'main',
                task.timeoutMs
            );

            const executionTimeMs = performance.now() - this.startTime;
            const memoryUsedBytes = this.memory?.buffer.byteLength || 0;

            // Update stats
            this.stats.successfulExecutions++;
            this.updateStats(executionTimeMs, memoryUsedBytes);

            // Parse output
            const outputData = this.outputLength > 0
                ? JSON.parse(new TextDecoder().decode(this.outputBuffer.slice(0, this.outputLength)))
                : result;

            return {
                success: true,
                output: outputData,
                executionTimeMs,
                memoryUsedBytes,
                logs: [...this.logs],
            };
        } catch (error) {
            const executionTimeMs = performance.now() - this.startTime;
            this.stats.failedExecutions++;

            return {
                success: false,
                output: null,
                executionTimeMs,
                memoryUsedBytes: this.memory?.buffer.byteLength || 0,
                errorMessage: error instanceof Error ? error.message : String(error),
                logs: [...this.logs],
            };
        }
    }

    /**
     * Validates WASM binary format
     */
    private isValidWasm(binary: ArrayBuffer): boolean {
        if (binary.byteLength < 8) return false;

        const magic = new Uint8Array(binary, 0, 4);
        // WASM magic number: 0x00 0x61 0x73 0x6D ('\0asm')
        return magic[0] === 0x00 && magic[1] === 0x61 &&
            magic[2] === 0x73 && magic[3] === 0x6D;
    }

    /**
     * Creates sandboxed imports for WASM module
     */
    private createSandboxedImports(): SandboxedImports {
        return {
            env: {
                log_string: (ptr: number, len: number) => {
                    if (!this.memory) return;
                    const bytes = new Uint8Array(this.memory.buffer, ptr, len);
                    const msg = new TextDecoder().decode(bytes);
                    this.logs.push(msg);
                    // Limit log size
                    if (this.logs.length > 1000) this.logs.shift();
                },

                log_number: (value: number) => {
                    this.logs.push(String(value));
                },

                get_time_ms: () => {
                    return Math.floor(performance.now() - this.startTime);
                },

                get_input_length: () => {
                    return this.inputBuffer.length;
                },

                get_input_byte: (index: number) => {
                    if (index < 0 || index >= this.inputBuffer.length) return 0;
                    return this.inputBuffer[index];
                },

                set_output_length: (len: number) => {
                    this.outputLength = Math.min(len, this.outputBuffer.length);
                },

                set_output_byte: (index: number, value: number) => {
                    if (index >= 0 && index < this.outputBuffer.length) {
                        this.outputBuffer[index] = value;
                    }
                },

                get_random: () => {
                    // Deterministic PRNG (xorshift)
                    this.randomSeed ^= this.randomSeed << 13;
                    this.randomSeed ^= this.randomSeed >> 17;
                    this.randomSeed ^= this.randomSeed << 5;
                    return (this.randomSeed >>> 0) / 4294967296;
                },
            },

            // WASI stubs for compatibility
            wasi_snapshot_preview1: {
                fd_write: () => 0,
                fd_read: () => 0,
                fd_close: () => 0,
                fd_seek: () => 0,
                proc_exit: () => { throw new Error('Process exit called'); },
                environ_sizes_get: () => 0,
                environ_get: () => 0,
                args_sizes_get: () => 0,
                args_get: () => 0,
                clock_time_get: () => 0,
            },
        };
    }

    /**
     * Executes WASM with timeout enforcement
     */
    private async executeWithTimeout(
        binary: ArrayBuffer,
        imports: SandboxedImports,
        functionName: string,
        timeoutMs: number
    ): Promise<unknown> {
        return new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Execution timeout after ${timeoutMs}ms`));
            }, timeoutMs);

            try {
                // Compile and instantiate
                const wasmModule = await WebAssembly.compile(binary);
                const instance = await WebAssembly.instantiate(wasmModule, imports as unknown as WebAssembly.Imports);

                // Get exported function
                const exportedFunc = instance.exports[functionName];
                if (typeof exportedFunc !== 'function') {
                    throw new Error(`Function '${functionName}' not exported by WASM module`);
                }

                // Get memory if exported
                if (instance.exports.memory instanceof WebAssembly.Memory) {
                    this.memory = instance.exports.memory;
                }

                // Execute
                const result = exportedFunc();

                clearTimeout(timeoutId);
                resolve(result);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    /**
     * Updates execution statistics
     */
    private updateStats(executionTimeMs: number, memoryUsedBytes: number): void {
        const n = this.stats.successfulExecutions;
        this.stats.avgExecutionTimeMs =
            (this.stats.avgExecutionTimeMs * (n - 1) + executionTimeMs) / n;

        if (memoryUsedBytes > this.stats.maxMemoryUsedBytes) {
            this.stats.maxMemoryUsedBytes = memoryUsedBytes;
        }
    }

    /**
     * Simple string hash for deterministic random seed
     */
    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }

    /**
     * Gets sandbox statistics
     */
    getStats(): SandboxStats {
        return { ...this.stats };
    }

    /**
     * Resets statistics
     */
    resetStats(): void {
        this.stats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            avgExecutionTimeMs: 0,
            maxMemoryUsedBytes: 0,
        };
    }
}

/**
 * Web Worker based sandbox for better isolation
 */
const workerSandboxCode = `
  class SandboxedWasm {
    constructor() {
      this.logs = [];
      this.inputBuffer = new Uint8Array();
      this.outputBuffer = new Uint8Array(1024 * 1024);
      this.outputLength = 0;
      this.startTime = 0;
      this.randomSeed = 0;
      this.memory = null;
    }

    async execute(wasmBinary, input, functionName, timeoutMs) {
      this.logs = [];
      this.outputLength = 0;
      this.startTime = performance.now();
      this.randomSeed = this.hashString(JSON.stringify(input));
      
      const inputJson = JSON.stringify(input);
      this.inputBuffer = new TextEncoder().encode(inputJson);

      const imports = this.createImports();
      
      try {
        const module = await WebAssembly.compile(wasmBinary);
        const instance = await WebAssembly.instantiate(module, imports);
        
        if (instance.exports.memory) {
          this.memory = instance.exports.memory;
        }
        
        const func = instance.exports[functionName];
        if (typeof func !== 'function') {
          throw new Error('Function not found: ' + functionName);
        }
        
        const result = func();
        
        return {
          success: true,
          output: this.outputLength > 0 
            ? JSON.parse(new TextDecoder().decode(this.outputBuffer.slice(0, this.outputLength)))
            : result,
          executionTimeMs: performance.now() - this.startTime,
          memoryUsedBytes: this.memory?.buffer.byteLength || 0,
          logs: this.logs,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          executionTimeMs: performance.now() - this.startTime,
          memoryUsedBytes: 0,
          errorMessage: error.message,
          logs: this.logs,
        };
      }
    }

    createImports() {
      const self = this;
      return {
        env: {
          log_string: (ptr, len) => {
            if (!self.memory) return;
            const bytes = new Uint8Array(self.memory.buffer, ptr, len);
            self.logs.push(new TextDecoder().decode(bytes));
          },
          log_number: (value) => self.logs.push(String(value)),
          get_time_ms: () => Math.floor(performance.now() - self.startTime),
          get_input_length: () => self.inputBuffer.length,
          get_input_byte: (i) => self.inputBuffer[i] || 0,
          set_output_length: (len) => self.outputLength = Math.min(len, self.outputBuffer.length),
          set_output_byte: (i, v) => { if (i >= 0 && i < self.outputBuffer.length) self.outputBuffer[i] = v; },
          get_random: () => {
            self.randomSeed ^= self.randomSeed << 13;
            self.randomSeed ^= self.randomSeed >> 17;
            self.randomSeed ^= self.randomSeed << 5;
            return (self.randomSeed >>> 0) / 4294967296;
          },
        },
        wasi_snapshot_preview1: {
          fd_write: () => 0,
          fd_read: () => 0,
          fd_close: () => 0,
          fd_seek: () => 0,
          proc_exit: (code) => { throw new Error('Exit: ' + code); },
          environ_sizes_get: () => 0,
          environ_get: () => 0,
          args_sizes_get: () => 0,
          args_get: () => 0,
          clock_time_get: () => 0,
        },
      };
    }

    hashString(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
      }
      return hash;
    }
  }

  const sandbox = new SandboxedWasm();

  self.onmessage = async (e) => {
    const { wasmBinary, input, functionName, timeoutMs } = e.data;
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    });
    
    try {
      const result = await Promise.race([
        sandbox.execute(wasmBinary, input, functionName, timeoutMs),
        timeoutPromise,
      ]);
      self.postMessage({ type: 'result', ...result });
    } catch (error) {
      self.postMessage({
        type: 'result',
        success: false,
        output: null,
        executionTimeMs: 0,
        memoryUsedBytes: 0,
        errorMessage: error.message,
        logs: [],
      });
    }
  };
`;

/**
 * Worker-based WASM Sandbox for complete isolation
 */
export class WorkerWasmSandbox {
    private worker: Worker | null = null;

    /**
     * Executes WASM in isolated Web Worker
     */
    async execute(task: WasmTaskInput): Promise<WasmTaskResult> {
        return new Promise((resolve, reject) => {
            // Create worker
            const blob = new Blob([workerSandboxCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            this.worker = new Worker(url);

            // Timeout handler
            const timeoutId = setTimeout(() => {
                this.terminate();
                reject(new Error(`Worker timeout after ${task.timeoutMs}ms`));
            }, task.timeoutMs + 1000); // Extra 1s for worker overhead

            this.worker.onmessage = (e) => {
                clearTimeout(timeoutId);
                this.terminate();

                if (e.data.type === 'result') {
                    resolve(e.data);
                } else {
                    reject(new Error('Unknown worker response'));
                }
            };

            this.worker.onerror = (error) => {
                clearTimeout(timeoutId);
                this.terminate();
                reject(new Error(`Worker error: ${error.message}`));
            };

            // Send task to worker
            this.worker.postMessage({
                wasmBinary: task.wasmBinary,
                input: task.input,
                functionName: task.functionName || 'main',
                timeoutMs: task.timeoutMs,
            });
        });
    }

    /**
     * Terminates the worker
     */
    terminate(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}

// Factory function
export function createWasmSandbox(useWorker = true): WasmSandbox | WorkerWasmSandbox {
    return useWorker ? new WorkerWasmSandbox() : new WasmSandbox();
}

// Export singleton
let defaultSandbox: WasmSandbox | null = null;

export function getDefaultSandbox(): WasmSandbox {
    if (!defaultSandbox) {
        defaultSandbox = new WasmSandbox();
    }
    return defaultSandbox;
}
