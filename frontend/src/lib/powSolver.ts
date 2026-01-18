/**
 * Proof-of-Work Solver for GSTD Platform
 * Uses Web Workers for background computation
 * SHA-256 based with configurable difficulty
 */

// PoW Challenge from backend
export interface PoWChallenge {
    task_id: string;
    challenge: string;
    difficulty: number;
    created_at: string;
    expires_at: string;
    worker_wallet: string;
}

// PoW Solution result
export interface PoWSolution {
    nonce: string;
    hash: string;
    iterations: number;
    timeMs: number;
}

// Progress callback type
export type PoWProgressCallback = (iterations: number, hashRate: number) => void;

/**
 * Counts leading zero bits in a hex string
 */
function countLeadingZeroBits(hexHash: string): number {
    let count = 0;
    for (let i = 0; i < hexHash.length; i++) {
        const nibble = parseInt(hexHash[i], 16);
        if (nibble === 0) {
            count += 4; // 4 zero bits
        } else {
            // Count leading zeros in this nibble
            if (nibble < 8) count++;
            if (nibble < 4) count++;
            if (nibble < 2) count++;
            break;
        }
    }
    return count;
}

/**
 * Computes SHA-256 hash using SubtleCrypto (browser native)
 */
async function sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Solves PoW challenge in the main thread (fallback)
 * @param challenge - The PoW challenge from backend
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to the solution
 */
export async function solvePoWChallenge(
    challenge: PoWChallenge,
    onProgress?: PoWProgressCallback
): Promise<PoWSolution> {
    const startTime = performance.now();
    let nonce = 0;
    let iterations = 0;
    const reportInterval = 10000; // Report progress every 10k iterations

    // Build data prefix (challenge + taskID + workerWallet)
    const dataPrefix = challenge.challenge + challenge.task_id + challenge.worker_wallet;

    while (true) {
        const data = dataPrefix + nonce.toString();
        const hash = await sha256(data);
        iterations++;

        // Check if we found a valid solution
        const leadingZeros = countLeadingZeroBits(hash);
        if (leadingZeros >= challenge.difficulty) {
            const timeMs = performance.now() - startTime;
            return {
                nonce: nonce.toString(),
                hash,
                iterations,
                timeMs,
            };
        }

        // Progress reporting
        if (onProgress && iterations % reportInterval === 0) {
            const elapsed = (performance.now() - startTime) / 1000;
            const hashRate = Math.round(iterations / elapsed);
            onProgress(iterations, hashRate);
        }

        // Check for expiry
        if (new Date() > new Date(challenge.expires_at)) {
            throw new Error('Challenge expired before solution found');
        }

        nonce++;
    }
}

/**
 * Web Worker inline code for PoW computation
 */
const workerCode = `
  async function sha256(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function countLeadingZeroBits(hexHash) {
    let count = 0;
    for (let i = 0; i < hexHash.length; i++) {
      const nibble = parseInt(hexHash[i], 16);
      if (nibble === 0) {
        count += 4;
      } else {
        if (nibble < 8) count++;
        if (nibble < 4) count++;
        if (nibble < 2) count++;
        break;
      }
    }
    return count;
  }

  self.onmessage = async function(e) {
    const { challenge, difficulty, dataPrefix, startNonce, batchSize } = e.data;
    const startTime = performance.now();
    
    for (let i = 0; i < batchSize; i++) {
      const nonce = startNonce + i;
      const data = dataPrefix + nonce.toString();
      const hash = await sha256(data);
      const zeros = countLeadingZeroBits(hash);
      
      if (zeros >= difficulty) {
        self.postMessage({
          type: 'solution',
          nonce: nonce.toString(),
          hash,
          iterations: i + 1,
          timeMs: performance.now() - startTime
        });
        return;
      }
      
      // Report progress every 1000 iterations
      if (i > 0 && i % 1000 === 0) {
        self.postMessage({
          type: 'progress',
          iterations: i,
          hashRate: Math.round(i / ((performance.now() - startTime) / 1000))
        });
      }
    }
    
    // Batch completed without solution
    self.postMessage({
      type: 'batch_complete',
      endNonce: startNonce + batchSize,
      iterations: batchSize
    });
  };
`;

/**
 * Creates a Web Worker from inline code
 */
function createWorkerFromCode(code: string): Worker {
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    return new Worker(url);
}

/**
 * Parallel PoW solver using Web Workers
 * Uses multiple workers for faster solving
 */
export class ParallelPoWSolver {
    private workers: Worker[] = [];
    private numWorkers: number;
    private isRunning = false;
    private abortController: AbortController | null = null;

    constructor(numWorkers: number = navigator.hardwareConcurrency || 4) {
        this.numWorkers = Math.min(numWorkers, 8); // Max 8 workers
    }

    /**
     * Solves PoW challenge using multiple parallel workers
     */
    async solve(
        challenge: PoWChallenge,
        onProgress?: PoWProgressCallback
    ): Promise<PoWSolution> {
        if (this.isRunning) {
            throw new Error('Solver is already running');
        }

        this.isRunning = true;
        this.abortController = new AbortController();
        const dataPrefix = challenge.challenge + challenge.task_id + challenge.worker_wallet;
        const batchSize = 10000;

        // Create workers
        for (let i = 0; i < this.numWorkers; i++) {
            this.workers.push(createWorkerFromCode(workerCode));
        }

        return new Promise((resolve, reject) => {
            let totalIterations = 0;
            let startTime = performance.now();
            let currentNonce = 0;
            let solutionFound = false;

            const assignBatch = (worker: Worker, startNonce: number) => {
                if (solutionFound) return;

                worker.postMessage({
                    challenge: challenge.challenge,
                    difficulty: challenge.difficulty,
                    dataPrefix,
                    startNonce,
                    batchSize,
                });
            };

            // Set up worker message handlers
            this.workers.forEach((worker, index) => {
                worker.onmessage = (e) => {
                    const msg = e.data;

                    if (msg.type === 'solution' && !solutionFound) {
                        solutionFound = true;
                        const totalTime = performance.now() - startTime;

                        // Clean up
                        this.cleanup();

                        resolve({
                            nonce: msg.nonce,
                            hash: msg.hash,
                            iterations: totalIterations + msg.iterations,
                            timeMs: totalTime,
                        });
                    } else if (msg.type === 'progress') {
                        totalIterations += 1000;
                        if (onProgress) {
                            const elapsed = (performance.now() - startTime) / 1000;
                            const hashRate = Math.round(totalIterations / elapsed);
                            onProgress(totalIterations, hashRate);
                        }
                    } else if (msg.type === 'batch_complete' && !solutionFound) {
                        totalIterations += msg.iterations;
                        currentNonce += batchSize;
                        assignBatch(worker, currentNonce + index * batchSize * 10);
                    }
                };

                worker.onerror = (error) => {
                    if (!solutionFound) {
                        this.cleanup();
                        reject(new Error(`Worker error: ${error.message}`));
                    }
                };

                // Start first batch for each worker
                assignBatch(worker, index * batchSize);
                currentNonce = this.numWorkers * batchSize;
            });

            // Expiry check
            const expiryCheck = setInterval(() => {
                if (new Date() > new Date(challenge.expires_at)) {
                    clearInterval(expiryCheck);
                    if (!solutionFound) {
                        this.cleanup();
                        reject(new Error('Challenge expired'));
                    }
                }
            }, 1000);

            // Cleanup on abort
            this.abortController?.signal.addEventListener('abort', () => {
                clearInterval(expiryCheck);
                this.cleanup();
                reject(new Error('PoW solving aborted'));
            });
        });
    }

    /**
     * Aborts the current solving operation
     */
    abort(): void {
        this.abortController?.abort();
    }

    /**
     * Cleans up workers
     */
    private cleanup(): void {
        this.workers.forEach(worker => worker.terminate());
        this.workers = [];
        this.isRunning = false;
        this.abortController = null;
    }
}

/**
 * Estimates time to solve based on difficulty
 */
export function estimateSolveTime(difficulty: number): string {
    // Average attempts = 2^difficulty
    const avgAttempts = Math.pow(2, difficulty);

    // Estimated hash rate in browser (Web Worker)
    const hashRate = 500000; // ~500K hashes/sec

    const estimatedSeconds = avgAttempts / hashRate;

    if (estimatedSeconds < 1) {
        return `~${Math.round(estimatedSeconds * 1000)}ms`;
    } else if (estimatedSeconds < 60) {
        return `~${Math.round(estimatedSeconds)}s`;
    } else {
        return `~${Math.round(estimatedSeconds / 60)}m`;
    }
}

/**
 * Creates default solver instance
 */
export function createPoWSolver(): ParallelPoWSolver {
    return new ParallelPoWSolver();
}

// Export singleton for convenience
let defaultSolver: ParallelPoWSolver | null = null;

export function getDefaultSolver(): ParallelPoWSolver {
    if (!defaultSolver) {
        defaultSolver = new ParallelPoWSolver();
    }
    return defaultSolver;
}
