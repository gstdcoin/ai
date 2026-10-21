const DISABLED_TASK_KINDS = new Set(['finetune', 'bridge_verify']);

export function isTaskExecutionEnabled(task: unknown): boolean {
    if (!task || typeof task !== 'object' || Array.isArray(task)) return false;

    const value = task as { type?: unknown; payload?: unknown; required_caps?: unknown };
    const payload = value.payload && typeof value.payload === 'object' && !Array.isArray(value.payload)
        ? value.payload as { kind?: unknown; job_id?: unknown; shard_id?: unknown }
        : null;
    const taskType = typeof value.type === 'string' ? value.type.toLowerCase() : '';
    const payloadKind = typeof payload?.kind === 'string' ? payload.kind.toLowerCase() : '';
    const hasFineTuneCapability = Array.isArray(value.required_caps)
        && value.required_caps.some(capability => typeof capability === 'string' && capability.toLowerCase() === 'finetune');
    const hasTrainingShard = typeof payload?.job_id === 'string' || typeof payload?.shard_id === 'string';

    return !DISABLED_TASK_KINDS.has(taskType)
        && !DISABLED_TASK_KINDS.has(payloadKind)
        && !hasFineTuneCapability
        && !hasTrainingShard;
}

export function supportsTaskKind(task: unknown, supportedKinds: readonly string[]): boolean {
    if (!isTaskExecutionEnabled(task)) return false;
    if (supportedKinds.length === 0) return true;
    if (!task || typeof task !== 'object') return false;

    const payload = (task as { payload?: unknown }).payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;

    const kind = (payload as { kind?: unknown }).kind;
    if (typeof kind === 'string' && supportedKinds.includes(kind)) return true;

    const type = (task as { type?: unknown }).type;
    return typeof type === 'string' && supportedKinds.includes(type);
}
