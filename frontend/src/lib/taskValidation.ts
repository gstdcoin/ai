import { canonicalModelId } from './modelId';

export function hasTaskResult(result: unknown): boolean {
    if (typeof result === 'string') return result.trim().length > 0;
    if (Array.isArray(result)) return result.length > 0;
    if (typeof result === 'object' && result !== null) return Object.keys(result).length > 0;
    return result !== undefined && result !== null;
}

/** A self-reported model mismatch is rejectable; a matching report is not proof
 * of model weights or answer quality. Old clients may omit model metadata. */
export function declaredTaskModelMismatch(expected: unknown, body: { model?: unknown; result?: unknown }): boolean {
    if (typeof expected !== 'string' || !expected || expected === 'auto') return false;
    const result = body.result && typeof body.result === 'object' ? body.result as { model?: unknown } : null;
    return [body.model, result?.model].some(model => typeof model === 'string'
        && canonicalModelId(model) !== canonicalModelId(expected));
}
