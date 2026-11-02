import {kvGet} from './kv';
/** Only the proof-gated Mini App link handler writes this authoritative association.
 * Legacy tg_wallet records are never authentication or account-data authority. */
export async function verifiedTelegramWallet(id:string|number):Promise<string|null> {
 const userId=String(id);if(!/^[1-9]\d{0,14}$/.test(userId))return null;
 return kvGet('tg_wallet_verified:'+userId);
}
