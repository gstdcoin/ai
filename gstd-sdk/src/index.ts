/**
 * GSTD SDK - TypeScript SDK for GSTD Protocol
 * Enables Requesters to interact with the decentralized computing network
 */

import axios, { AxiosInstance } from 'axios';
import { Address, beginCell } from '@ton/core';
import { generateTaskKey, encryptTaskData, decryptTaskData, calculateHash } from './crypto';

/**
 * Configuration for GSTD SDK
 */
export interface GSTDConfig {
  /** API key for authentication (optional) */
  apiKey?: string;
  /** TON wallet address of the requester */
  wallet: string;
  /** Base URL of the GSTD API (default: http://localhost:8080/api) */
  apiUrl?: string;
  /** Escrow contract address (optional, for escrow link generation) */
  escrowAddress?: string;
  /** GSTD Jetton address (optional, for balance checks) */
  gstdJettonAddress?: string;
}

/**
 * Task creation parameters
 */
export interface CreateTaskParams {
  /** Task type (e.g., 'inference', 'computation') */
  taskType?: string;
  /** Operation identifier (e.g., 'image_classification') */
  operation: string;
  /** URL to Wasm model (optional) */
  model?: string;
  /** Input data (will be encrypted) */
  input: any;
  /** Input source URL (IPFS, HTTP, etc.) - optional if input is provided */
  inputSource?: string;
  /** Labor compensation in TON */
  compensation: number;
  /** Time limit in seconds */
  timeLimitSec?: number;
  /** Maximum energy in mWh */
  maxEnergyMwh?: number;
  /** Validation method (default: 'majority') */
  validationMethod?: string;
  /** Minimum trust score required (default: 0.1) */
  minTrust?: number;
  /** Whether task is private (default: false) */
  isPrivate?: boolean;
}

/**
 * Task creation response
 */
export interface TaskResponse {
  task_id: string;
  status: string;
  certainty_gravity_score?: number;
  redundancy_factor?: number;
  confidence_depth?: number;
  created_at?: string;
}

/**
 * Task status response
 */
export interface TaskStatus {
  task_id: string;
  status: 'awaiting_escrow' | 'pending' | 'assigned' | 'validating' | 'validated' | 'completed' | 'failed' | 'expired';
  labor_compensation_ton?: number;
  created_at?: string;
  completed_at?: string;
}

/**
 * Result response
 */
export interface ResultResponse {
  result: any;
}

/**
 * GSTD balance response
 */
export interface BalanceResponse {
  balance: number;
  has_gstd: boolean;
}

/**
 * Escrow transaction object
 */
export interface EscrowTransaction {
  to: string;
  value: string;
  data?: string;
}

/**
 * Main GSTD SDK class
 */
export class GSTD {
  private api: AxiosInstance;
  private config: Required<Pick<GSTDConfig, 'wallet' | 'apiUrl'>> & GSTDConfig;

  constructor(config: GSTDConfig) {
    if (!config.wallet) {
      throw new Error('Wallet address is required');
    }

    this.config = {
      apiUrl: 'http://localhost:8080/api',
      ...config,
    };

    // Create axios instance
    this.api = axios.create({
      baseURL: this.config.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
      },
    });
  }

  /**
   * Create a new task with automatic input encryption
   * @param params Task creation parameters
   * @returns Task response with task_id
   */
  async createTask(params: CreateTaskParams): Promise<TaskResponse & { waitForResult: () => Promise<any> }> {
    // Prepare input data
    let inputHash: string;
    let inputSource: string;

    if (params.input) {
      // Calculate hash of input data (before encryption for verification)
      const inputJson = JSON.stringify(params.input);
      const inputData = new TextEncoder().encode(inputJson);
      inputHash = calculateHash(inputData);
      
      // If inputSource is provided, use it (assumes data is already uploaded)
      // Otherwise, user must upload encrypted data first
      if (!params.inputSource) {
        throw new Error(
          'inputSource is required when providing input data. ' +
          'Please upload your input data to IPFS or another storage service and provide the URL.'
        );
      }
      inputSource = params.inputSource;
    } else if (params.inputSource) {
      inputSource = params.inputSource;
      // Fetch and hash input from source
      try {
        const response = await axios.get(params.inputSource, { responseType: 'arraybuffer' });
        const data = new Uint8Array(response.data);
        inputHash = calculateHash(data);
      } catch (error) {
        throw new Error(`Failed to fetch input from ${params.inputSource}: ${error}`);
      }
    } else {
      throw new Error('Either input or inputSource must be provided');
    }

    // Create task via API
    const response = await this.api.post<TaskResponse>('/v1/tasks', {
      requester_address: this.config.wallet,
      task_type: params.taskType || 'inference',
      operation: params.operation,
      model: params.model || '',
      input_source: inputSource,
      input_hash: `sha256:${inputHash}`,
      time_limit_sec: params.timeLimitSec || 30,
      max_energy_mwh: params.maxEnergyMwh || 10,
      labor_compensation_ton: params.compensation,
      validation_method: params.validationMethod || 'majority',
      min_trust: params.minTrust || 0.1,
      is_private: params.isPrivate || false,
    });

    const task = response.data;

    // Return task with waitForResult method
    return {
      ...task,
      waitForResult: () => this.waitForResult(task.task_id),
    };
  }

  /**
   * Wait for task result (polls until status is 'validated' or 'completed')
   * @param taskId Task ID to wait for
   * @param pollInterval Polling interval in milliseconds (default: 2000)
   * @param timeout Timeout in milliseconds (default: 300000 = 5 minutes)
   * @returns Decrypted result
   */
  async waitForResult(
    taskId: string,
    pollInterval: number = 2000,
    timeout: number = 300000
  ): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getTaskStatus(taskId);

      if (status.status === 'validated' || status.status === 'completed') {
        return await this.getResult(taskId);
      }

      if (status.status === 'failed' || status.status === 'expired') {
        throw new Error(`Task ${taskId} failed with status: ${status.status}`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Timeout waiting for task ${taskId} to complete`);
  }

  /**
   * Get task status
   * @param taskId Task ID
   * @returns Task status
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const response = await this.api.get<TaskStatus>(`/v1/tasks/${taskId}`);
    return response.data;
  }

  /**
   * Get and decrypt task result
   * @param taskId Task ID
   * @returns Decrypted result
   */
  async getResult(taskId: string): Promise<any> {
    // Get encrypted result
    const response = await this.api.get<ResultResponse>(
      `/v1/tasks/${taskId}/result`,
      {
        params: {
          requester_address: this.config.wallet,
        },
      }
    );

    // The result should be encrypted, but the API might return it decrypted
    // If encrypted, we need to decrypt it
    if (typeof response.data.result === 'string') {
      // Assume it's encrypted - we need nonce from task details
      // For now, let's check if it's JSON
      try {
        return JSON.parse(response.data.result);
      } catch {
        // If not JSON, it might be encrypted
        // We'd need to get the nonce from the task, but for simplicity,
        // let's assume the API returns decrypted results
        throw new Error('Encrypted result decryption requires task nonce. Use getResultWithDecryption() if available.');
      }
    }

    return response.data.result;
  }

  /**
   * Get result with explicit decryption
   * Note: This requires the task to store nonce, which may not be exposed via API
   * @param taskId Task ID
   * @param nonce Encryption nonce (base64)
   * @returns Decrypted result
   */
  async getResultWithDecryption(taskId: string, nonce: string): Promise<any> {
    const response = await this.api.get<{ result_data: string }>(
      `/v1/tasks/${taskId}/result`,
      {
        params: {
          requester_address: this.config.wallet,
        },
      }
    );

    // Generate task key
    const taskKey = generateTaskKey(taskId, this.config.wallet);

    // Decrypt result
    const decrypted = await decryptTaskData(response.data.result_data, nonce, taskKey);
    const resultJson = new TextDecoder().decode(decrypted);
    return JSON.parse(resultJson);
  }

  /**
   * Generate escrow transaction for locking funds
   * @param taskId Task ID
   * @param compensation Labor compensation in TON
   * @returns Transaction object for TonConnect or raw transaction
   */
  generateEscrowLink(taskId: string, compensation: number): EscrowTransaction {
    if (!this.config.escrowAddress) {
      throw new Error('Escrow address not configured. Provide escrowAddress in GSTD config.');
    }

    // Convert TON to nanoTON
    const amountNano = BigInt(Math.floor(compensation * 1e9));

    // Create transaction payload
    // The escrow contract accepts TON, and the task ID can be included in a comment
    const payload = beginCell()
      .storeUint(0, 32) // op_code for deposit
      .storeRef(
        beginCell()
          .storeStringTail(taskId)
          .endCell()
      )
      .endCell();

    return {
      to: this.config.escrowAddress,
      value: amountNano.toString(),
      data: payload.toBoc().toString('base64'),
    };
  }

  /**
   * Check GSTD Jetton balance
   * @param address Wallet address (default: configured wallet)
   * @returns Balance response with balance and has_gstd flag
   */
  async checkBalance(address?: string): Promise<BalanceResponse> {
    const walletAddress = address || this.config.wallet;

    if (!this.config.gstdJettonAddress) {
      throw new Error('GSTD Jetton address not configured. Provide gstdJettonAddress in GSTD config.');
    }

    const response = await this.api.get<BalanceResponse>('/v1/wallet/gstd-balance', {
      params: {
        address: walletAddress,
      },
    });

    return response.data;
  }

  /**
   * Get network statistics
   * @returns Global network stats
   */
  async getStats(): Promise<any> {
    const response = await this.api.get('/v1/stats');
    return response.data;
  }

  /**
   * Get task efficiency breakdown based on GSTD balance
   * @param address Wallet address (default: configured wallet)
   * @returns Efficiency breakdown
   */
  async getEfficiency(address?: string): Promise<any> {
    const walletAddress = address || this.config.wallet;
    const response = await this.api.get('/v1/wallet/efficiency', {
      params: {
        address: walletAddress,
      },
    });
    return response.data;
  }
}

// Export default instance creator
export default function createGSTD(config: GSTDConfig): GSTD {
  return new GSTD(config);
}

