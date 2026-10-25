import { kvGet } from './kv';

/** Wallet (lowercased) bound to the X-Session-Token issued after a verified TON proof login, or null. */
export async function sessionWallet(headers: Record<string, string | string[] | undefined>): Promise<string | null> {
    const raw = headers['x-session-token'];
    const token = Array.isArray(raw) ? raw[0] : raw;
    if (!token || token.length > 256) return null;
    const wallet = await kvGet(`ton-auth:session:${token}`);
    return wallet ? String(wallet).toLowerCase() : null;
}
