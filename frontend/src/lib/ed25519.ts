import { createPublicKey, verify } from 'node:crypto';

/** Native Ed25519 keeps request authentication within the free Worker CPU budget. */
export function verifyEd25519(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    try {
        if (publicKey.length !== 32 || signature.length !== 64) return false;
        const key = createPublicKey({
            key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey)]),
            format: 'der',
            type: 'spki',
        });
        return verify(null, message, key, signature);
    } catch { return false; }
}
