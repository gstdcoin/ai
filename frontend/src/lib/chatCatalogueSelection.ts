export interface ChatCatalogueModel { model_id: string; nodes_count: number; price_gstd: number }
export type ChatCatalogueState = 'loading' | 'ready' | 'failed';
export function requestedChatModel(search: string): string {
    return new URLSearchParams(search).get('model') || 'auto';
}
/** An explicit handoff never becomes auto merely because its model is absent. */
export function chatModelBlockReason(model: string, models: ChatCatalogueModel[], state: ChatCatalogueState, tier: string): string | null {
    if (state === 'loading') return 'catalogue_loading';
    if (state === 'failed') return 'catalogue_failed';
    if (model === 'auto') return null;
    const selected = models.find(item => item.model_id === model && item.nodes_count > 0);
    if (!selected) return 'model_unavailable';
    if (tier === 'free' && selected.price_gstd > 0) return 'paid_tier_required';
    return null;
}
