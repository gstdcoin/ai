/** Ollama omits only the default :latest tag; distinct families/tags stay exact. */
export function canonicalModelId(model: string): string {
    if (model === 'auto' || model.includes('@') || model.split('/').pop()!.includes(':')) return model;
    return model + ':latest';
}
