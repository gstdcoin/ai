export function hasTaskResult(result: unknown): boolean {
    if (typeof result === 'string') return result.trim().length > 0;
    if (Array.isArray(result)) return result.length > 0;
    if (typeof result === 'object' && result !== null) return Object.keys(result).length > 0;
    return result !== undefined && result !== null;
}
