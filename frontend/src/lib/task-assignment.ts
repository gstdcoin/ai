import { kvSetNX } from './kv';
import { isTaskExecutionEnabled } from './taskKinds';
import { moneyJob } from './money';

export interface TaskAssignment {
    funding_id?: string;
    node_id: string;
    assigned_at: number;
    task_type?: string;
    reward_gstd: number;
    protocol_fee_gstd: number;
    campaign_id?: string;
    job_id?: string;
    shard_id?: string;
    expected_hash?: string;
}

export async function assignTaskToNode(
    task: Record<string, any>,
    nodeId: string,
    ttlSeconds: number,
): Promise<boolean> {
    if (typeof task.task_id !== 'string' || !task.task_id || !isTaskExecutionEnabled(task)) return false;

    // Only server-funded tasks (campaigns, marketplace) set task.reward_gstd. Client-controlled
    // payload fields and unfunded public submissions must never create ledger earnings.
    const assignment: TaskAssignment = {
        node_id: nodeId,
        assigned_at: Date.now(),
        reward_gstd: 0, // Legacy accrual disabled; v2 escrow owns money.
        protocol_fee_gstd: 0,
    };
    if (task.funding_version === 2 && task.funding_id === task.task_id) {
        const funding = await moneyJob(task.task_id);
        if (!funding || funding.state !== 'reserved' || funding.kind !== 'task' || funding.expiresAt <= Date.now()) return false;
        assignment.funding_id = task.task_id;
    }
    if (typeof task.type === 'string') assignment.task_type = task.type;
    if (typeof task.expected_hash === 'string' && /^[0-9a-f]{64}$/.test(task.expected_hash)) assignment.expected_hash = task.expected_hash;
    if (typeof task.campaign_id === 'string') assignment.campaign_id = task.campaign_id;
    const payload = task.payload && typeof task.payload === 'object' ? task.payload : {};
    if (typeof payload.job_id === 'string') assignment.job_id = payload.job_id;
    if (typeof payload.shard_id === 'string') assignment.shard_id = payload.shard_id;
    if (typeof task.job_id === 'string') assignment.job_id = task.job_id;
    if (typeof task.shard_id === 'string') assignment.shard_id = task.shard_id;

    return kvSetNX(`task_assigned:${task.task_id}`, JSON.stringify(assignment), ttlSeconds);
}
