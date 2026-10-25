import { createHash, timingSafeEqual } from 'crypto';

function secretDigest(value: string): Buffer {
    return createHash('sha256').update(value, 'utf8').digest();
}

export function matchesSecret(candidate: unknown, expected: string | undefined): boolean {
    if (typeof candidate !== 'string' || !expected) return false;
    return timingSafeEqual(secretDigest(candidate), secretDigest(expected));
}

export function matchesAnySecret(
    candidate: unknown,
    expectedSecrets: readonly (string | undefined)[],
): boolean {
    let matched = false;
    for (const expected of expectedSecrets) {
        if (expected) matched = matchesSecret(candidate, expected) || matched;
    }
    return matched;
}
