export function supportsTaskKind(task: unknown, supportedKinds: readonly string[]): boolean {
    if (supportedKinds.length === 0) return true;
    if (!task || typeof task !== 'object') return false;

    const payload = (task as { payload?: unknown }).payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;

    const kind = (payload as { kind?: unknown }).kind;
    return typeof kind === 'string' && supportedKinds.includes(kind);
}
