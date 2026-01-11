// Browser-based Task Runner using Web Workers for computation simulation
// This simulates real CPU work without blocking the UI

export interface TaskRunnerProgress {
  progress: number; // 0-100
  status: 'idle' | 'running' | 'completed' | 'error';
  message: string;
}

export interface TaskRunnerResult {
  success: boolean;
  result: any;
  executionTimeMs: number;
  error?: string;
}

// Web Worker code as a string (inline worker)
const workerCode = `
  self.onmessage = function(e) {
    const { taskId, duration, taskData } = e.data;
    
    const startTime = performance.now();
    const endTime = startTime + duration;
    const updateInterval = 50; // Update every 50ms
    
    // Simulate CPU-intensive computation
    function simulateComputation() {
      const now = performance.now();
      const elapsed = now - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      
      // Real CPU work: verify task data integrity
      let verificationResult = true;
      if (taskData) {
        try {
          // Simulate data verification
          const dataStr = JSON.stringify(taskData);
          let hash = 0;
          for (let i = 0; i < dataStr.length; i++) {
            hash = ((hash << 5) - hash) + dataStr.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
          }
          verificationResult = hash !== 0;
        } catch (e) {
          verificationResult = false;
        }
      }
      
      // Send progress update
      self.postMessage({
        type: 'progress',
        progress: Math.floor(progress),
        status: progress >= 100 ? 'completed' : 'running',
        message: progress >= 100 
          ? 'Computation completed' 
          : \`Processing... \${Math.floor(progress)}%\`
      });
      
      if (now < endTime) {
        setTimeout(simulateComputation, updateInterval);
      } else {
        // Final result
        const executionTime = Math.floor(now - startTime);
        self.postMessage({
          type: 'complete',
          success: verificationResult,
          result: {
            taskId,
            verified: verificationResult,
            computationHash: verificationResult ? 'verified' : 'failed',
            timestamp: Date.now()
          },
          executionTimeMs: executionTime
        });
      }
    }
    
    simulateComputation();
  };
`;

// Create a blob URL for the worker
function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') {
    logger.warn('Web Workers not supported');
    return null;
  }

  try {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    return new Worker(workerUrl);
  } catch (error) {
    logger.error('Failed to create Web Worker', error);
    return null;
  }
}

// Fallback: Run computation in main thread with requestAnimationFrame
async function runComputationFallback(
  taskId: string,
  duration: number,
  taskData: any,
  onProgress: (progress: TaskRunnerProgress) => void
): Promise<TaskRunnerResult> {
  const startTime = performance.now();
  const endTime = startTime + duration;
  
  return new Promise((resolve) => {
    function step() {
      const now = performance.now();
      const elapsed = now - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      
      // Simulate computation
      let verificationResult = true;
      if (taskData) {
        try {
          const dataStr = JSON.stringify(taskData);
          let hash = 0;
          for (let i = 0; i < Math.min(dataStr.length, 1000); i++) {
            hash = ((hash << 5) - hash) + dataStr.charCodeAt(i);
            hash = hash & hash;
          }
          verificationResult = hash !== 0;
        } catch (e) {
          verificationResult = false;
        }
      }
      
      onProgress({
        progress: Math.floor(progress),
        status: progress >= 100 ? 'completed' : 'running',
        message: progress >= 100 
          ? 'Computation completed' 
          : `Processing... ${Math.floor(progress)}%`
      });
      
      if (now < endTime) {
        requestAnimationFrame(step);
      } else {
        const executionTime = Math.floor(now - startTime);
        resolve({
          success: verificationResult,
          result: {
            taskId,
            verified: verificationResult,
            computationHash: verificationResult ? 'verified' : 'failed',
            timestamp: Date.now()
          },
          executionTimeMs: executionTime
        });
      }
    }
    
    requestAnimationFrame(step);
  });
}

export class TaskRunner {
  private worker: Worker | null = null;
  private isRunning = false;
  private currentTaskId: string | null = null;

  constructor() {
    this.worker = createWorker();
    
    if (this.worker) {
      this.worker.onmessage = (e) => {
        const { type, progress, status, message, success, result, executionTimeMs } = e.data;
        
        if (type === 'progress') {
          // Progress updates are handled by the caller
          return;
        }
        
        if (type === 'complete') {
          this.isRunning = false;
          this.currentTaskId = null;
        }
      };
      
      this.worker.onerror = (error) => {
        console.error('TaskRunner worker error:', error);
        this.isRunning = false;
        this.currentTaskId = null;
      };
    }
  }

  async runTask(
    taskId: string,
    taskData: any,
    duration: number = 10000, // 10 seconds default
    onProgress?: (progress: TaskRunnerProgress) => void
  ): Promise<TaskRunnerResult> {
    if (this.isRunning) {
      throw new Error('Task runner is already running');
    }

    this.isRunning = true;
    this.currentTaskId = taskId;

    if (this.worker) {
      // Use Web Worker
      return new Promise((resolve, reject) => {
        const progressHandler = (e: MessageEvent) => {
          const { type, progress, status, message, success, result, executionTimeMs } = e.data;
          
          if (type === 'progress' && onProgress) {
            onProgress({
              progress,
              status,
              message
            });
          }
          
          if (type === 'complete') {
            this.worker?.removeEventListener('message', progressHandler);
            this.isRunning = false;
            this.currentTaskId = null;
            
            if (success) {
              resolve({
                success: true,
                result,
                executionTimeMs
              });
            } else {
              reject(new Error('Task computation failed'));
            }
          }
        };
        
        if (this.worker) {
          this.worker.addEventListener('message', progressHandler);
          this.worker.postMessage({ taskId, duration, taskData });
        } else {
          reject(new Error('Worker not initialized'));
        }
      });
    } else {
      // Fallback to main thread
      return runComputationFallback(taskId, duration, taskData, (progress) => {
        if (onProgress) {
          onProgress(progress);
        }
      });
    }
  }

  stop() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = createWorker();
    }
    this.isRunning = false;
    this.currentTaskId = null;
  }

  isTaskRunning(): boolean {
    return this.isRunning;
  }

  getCurrentTaskId(): string | null {
    return this.currentTaskId;
  }

  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isRunning = false;
    this.currentTaskId = null;
  }
}

// Singleton instance
let taskRunnerInstance: TaskRunner | null = null;

export function getTaskRunner(): TaskRunner {
  if (!taskRunnerInstance) {
    taskRunnerInstance = new TaskRunner();
  }
  return taskRunnerInstance;
}

