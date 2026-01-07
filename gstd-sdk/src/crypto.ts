/**
 * Cryptographic utilities for GSTD SDK
 * Implements AES-256-GCM encryption matching backend EncryptionService
 */

import { sha256 } from '@ton/crypto';

// Detect environment
const isNode = typeof process !== 'undefined' && process.versions?.node;
let nodeCrypto: any = null;
if (isNode) {
  try {
    nodeCrypto = require('crypto');
  } catch {
    // Node crypto not available
  }
}

/**
 * Get crypto API (Web Crypto or Node.js crypto)
 */
function getCrypto(): any {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto;
  }
  if (nodeCrypto) {
    return nodeCrypto;
  }
  throw new Error('Crypto API not available. Requires Web Crypto API or Node.js crypto module.');
}

/**
 * Generate a task encryption key from taskID and requester address
 * Matches backend: SHA-256(taskID + requesterAddress)
 */
export function generateTaskKey(taskID: string, requesterAddress: string): Uint8Array {
  const seed = taskID + requesterAddress;
  return sha256(seed);
}

/**
 * Encrypt task data using AES-256-GCM
 * Returns: { encryptedData: base64, nonce: base64 }
 */
export async function encryptTaskData(
  plaintext: Uint8Array | string,
  key: Uint8Array
): Promise<{ encryptedData: string; nonce: string }> {
  // Convert plaintext to Uint8Array if string
  const data = typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;

  // Derive AES key from provided key (SHA-256 hash)
  const keyHash = sha256(key);
  const aesKey = keyHash.slice(0, 32); // AES-256 requires 32 bytes

  const cryptoApi = getCrypto();

  // Generate random nonce (12 bytes for GCM)
  let nonce: Uint8Array;
  if (nodeCrypto) {
    nonce = nodeCrypto.randomBytes(12);
  } else {
    nonce = cryptoApi.getRandomValues(new Uint8Array(12));
  }

  // Encrypt using Web Crypto API or Node.js crypto
  let ciphertext: Uint8Array;
  if (nodeCrypto) {
    // Node.js crypto
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', Buffer.from(aesKey), nonce);
    cipher.setAAD(Buffer.alloc(0)); // No additional authenticated data
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    ciphertext = new Uint8Array(Buffer.concat([encrypted, tag]));
  } else {
    // Web Crypto API
    const cryptoKey = await cryptoApi.subtle.importKey(
      'raw',
      aesKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const encrypted = await cryptoApi.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        tagLength: 128, // 128-bit authentication tag
      },
      cryptoKey,
      data
    );

    ciphertext = new Uint8Array(encrypted);
  }

  // Encode to base64
  const encryptedData = bufferToBase64(ciphertext);
  const nonceStr = bufferToBase64(nonce);

  return { encryptedData, nonce: nonceStr };
}

/**
 * Decrypt task data using AES-256-GCM
 */
export async function decryptTaskData(
  encryptedData: string,
  nonce: string,
  key: Uint8Array
): Promise<Uint8Array> {
  // Decode from base64
  const ciphertext = base64ToBuffer(encryptedData);
  const nonceBytes = base64ToBuffer(nonce);

  // Derive AES key
  const keyHash = sha256(key);
  const aesKey = keyHash.slice(0, 32);

  const cryptoApi = getCrypto();

  // Decrypt using Web Crypto API or Node.js crypto
  let plaintext: Uint8Array;
  if (nodeCrypto) {
    // Node.js crypto
    const encrypted = ciphertext.slice(0, -16); // Remove auth tag
    const tag = ciphertext.slice(-16); // Get auth tag
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', Buffer.from(aesKey), nonceBytes);
    decipher.setAuthTag(Buffer.from(tag));
    decipher.setAAD(Buffer.alloc(0));
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    plaintext = new Uint8Array(decrypted);
  } else {
    // Web Crypto API
    const cryptoKey = await cryptoApi.subtle.importKey(
      'raw',
      aesKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await cryptoApi.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonceBytes,
        tagLength: 128,
      },
      cryptoKey,
      ciphertext
    );

    plaintext = new Uint8Array(decrypted);
  }

  return plaintext;
}

/**
 * Calculate SHA-256 hash of input data
 */
export function calculateHash(data: Uint8Array | string): string {
  const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = sha256(input);
  return Array.from(hash)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert buffer to base64 (universal)
 */
function bufferToBase64(buffer: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  // Browser fallback
  return btoa(String.fromCharCode(...buffer));
}

/**
 * Convert base64 to buffer (universal)
 */
function base64ToBuffer(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  // Browser fallback
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

