// Auto Task Worker Hook - Automatically starts task execution in browser
import { useEffect, useRef, useCallback } from 'react';
import { TaskWorker, executeTask, submitTaskResult } from '../lib/taskWorker';
import { useWalletStore } from '../store/walletStore';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { logger } from '../lib/logger';

interface Node {
  id: string;
  wallet_address: string;
  name: string;
  status: string;
}

export function useAutoTaskWorker(nodes: Node[]) {
  const { address } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const workersRef = useRef<Map<string, TaskWorker>>(new Map());
  const processingTasks = useRef<Set<string>>(new Set());

  // Memoize task handler to prevent recreation on every render
  const handleTask = useCallback(async (notification: any, deviceID: string) => {
    const taskID = notification.task.task_id;
    
    // Prevent duplicate processing
    if (processingTasks.current.has(taskID)) {
      logger.debug('Task already being processed', { taskID, deviceID });
      return;
    }

    processingTasks.current.add(taskID);
    logger.info('Received task', { taskID, deviceID });

    const worker = workersRef.current.get(deviceID);
    if (!worker) {
      logger.error('No worker found for device', new Error(`Device ${deviceID} not found`));
      processingTasks.current.delete(taskID);
      return;
    }

    try {
      // Claim the task
      worker.claimTask(taskID);
      logger.debug('Claimed task', { taskID });

      // Execute the task automatically
      const result = await executeTask(notification.task);
      logger.info('Task executed successfully', { taskID });

      // Submit result with signature
      await submitTaskResult(
        taskID,
        deviceID,
        result,
        result.execution_time_ms,
        tonConnectUI
      );
      logger.info('Task result submitted', { taskID });
    } catch (error) {
      logger.error('Failed to process task', error, { taskID, deviceID });
    } finally {
      processingTasks.current.delete(taskID);
    }
  }, [tonConnectUI]);

  useEffect(() => {
    if (!address || nodes.length === 0) {
      // Cleanup workers if no nodes
      workersRef.current.forEach(worker => worker.disconnect());
      workersRef.current.clear();
      processingTasks.current.clear();
      return;
    }

    // Start workers for each registered node
    nodes.forEach(node => {
      // Skip if worker already exists
      if (workersRef.current.has(node.id)) {
        return;
      }

      logger.info('Starting auto task worker', { nodeId: node.id });

      const worker = new TaskWorker(node.id, node.wallet_address);
      
      worker.setCallbacks(
        // onTaskReceived - automatically execute tasks
        (notification) => handleTask(notification, node.id),
        // onError
        (error) => {
          logger.error('Task worker error', error, { nodeId: node.id });
        }
      );

      // Connect to WebSocket
      worker.connect();
      workersRef.current.set(node.id, worker);
    });

    // Cleanup removed nodes
    const currentDeviceIDs = new Set(nodes.map(node => node.id));
    workersRef.current.forEach((worker, deviceID) => {
      if (!currentDeviceIDs.has(deviceID)) {
        logger.info('Disconnecting worker for removed device', { deviceID });
        worker.disconnect();
        workersRef.current.delete(deviceID);
      }
    });

    // Cleanup on unmount
    return () => {
      workersRef.current.forEach(worker => worker.disconnect());
      workersRef.current.clear();
      processingTasks.current.clear();
    };
  }, [address, nodes, handleTask]);
}

