import { BASE_TASK_FEE } from './rewards';
import { kvSetNX } from './kv';

const MAX_TASK_REWARD = 50;
const MAX_PROTOCOL_FEE = 10;
export interface TaskAssignment {
    node_id: string;
    assigned_at: number;
    reward_gstd: number;
    protocol_fee_gstd: number;
    campaign_id?: string;
    job_id?: string;
    shard_id?: string;
}

function boundedAmount(value: unknown, fallback: number, maximum: number): number {
    if (value == null) return fallback;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return 0;
    return Math.min(maximum, amount);
}

export async function assignTaskToNode(
    task: Record<string, any>,
    nodeId: string,
    ttlSeconds: number,
): Promise<boolean> {
    if (typeof task.task_id !== 'string' || !task.task_id) return false;

    const payloadReward = task.payload && typeof task.payload === 'object'
        ? task.payload.reward_gstd
        : undefined;
    const reward = task.reward_gstd ?? payloadReward;
    const assignment: TaskAssignment = {
        node_id: nodeId,
        assigned_at: Date.now(),
        reward_gstd: boundedAmount(reward, BASE_TASK_FEE, MAX_TASK_REWARD),
        protocol_fee_gstd: boundedAmount(task.protocol_fee, 0, MAX_PROTOCOL_FEE),
    };
    if (typeof task.campaign_id === 'string') assignment.campaign_id = task.campaign_id;
    const payload = task.payload && typeof task.payload === 'object' ? task.payload : {};
    if (typeof payload.job_id === 'string') assignment.job_id = payload.job_id;
    if (typeof payload.shard_id === 'string') assignment.shard_id = payload.shard_id;
    if (typeof task.job_id === 'string') assignment.job_id = task.job_id;
    if (typeof task.shard_id === 'string') assignment.shard_id = task.shard_id;

    return kvSetNX(`task_assigned:${task.task_id}`, JSON.stringify(assignment), ttlSeconds);
}
