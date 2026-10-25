import { randomBytes } from 'crypto';

/** Unpredictable short identifier for job/request/proof ids. */
export function randomId(bytes = 6): string {
    return randomBytes(bytes).toString('hex');
}
