import { expect, it } from 'vitest';
import { requestedChatModel, chatModelBlockReason } from './chatCatalogueSelection';
const models = [{model_id:'paid:large',nodes_count:1,price_gstd:0.01},{model_id:'free:small',nodes_count:1,price_gstd:0}];
it('preserves an unavailable explicit node handoff rather than selecting auto',()=>{
 const model=requestedChatModel('?model=missing%3Alarge');
 expect(model).toBe('missing:large');
 expect(chatModelBlockReason(model,models,'ready','standard')).toBe('model_unavailable');
 expect(chatModelBlockReason(model,[],'ready','standard')).toBe('model_unavailable');
});
it('blocks send while the catalogue loads or fails without replacing the selection',()=>{
 expect(chatModelBlockReason('paid:large',models,'loading','standard')).toBe('catalogue_loading');
 expect(chatModelBlockReason('paid:large',models,'failed','standard')).toBe('catalogue_failed');
});
it('does not silently replace a paid model when a user chooses the free tier',()=>{
 expect(chatModelBlockReason('paid:large',models,'ready','free')).toBe('paid_tier_required');
 expect(chatModelBlockReason('paid:large',models,'ready','standard')).toBeNull();
 expect(chatModelBlockReason('free:small',models,'ready','free')).toBeNull();
});
it('allows explicitly chosen auto and rejects a model with no live executors',()=>{
 expect(requestedChatModel('')).toBe('auto');
 expect(requestedChatModel('?model=auto')).toBe('auto');
 expect(chatModelBlockReason('auto',models,'ready','free')).toBeNull();
 expect(chatModelBlockReason('paid:large',[{...models[0],nodes_count:0}],'ready','standard')).toBe('model_unavailable');
});
