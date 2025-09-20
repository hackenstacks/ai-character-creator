import { logger } from './loggingService';

const SIGN_ALGORITHM = {
  name: 'ECDSA',
  namedCurve: 'P-256',
};

const HASH_ALGORITHM = {
  name: 'SHA-256',
};

// --- Key Management ---

/**
 * Generates a new cryptographic key pair for signing and verification.
 * Uses ECDSA with the P-256 curve.
 */
export const generateSigningKeyPair = async (): Promise<CryptoKeyPair> => {
  try {
    return await window.crypto.subtle.generateKey(SIGN_ALGORITHM, true, ['sign', 'verify']);
  } catch (error) {
    logger.error('Key pair generation failed.', error);
    throw new Error('Could not generate key pair.');
  }
};

/**
 * Exports a CryptoKey into a portable JSON Web Key (JWK) format.
 */
export const exportKey = async (key: CryptoKey): Promise<JsonWebKey> => {
  try {
    return await window.crypto.subtle.exportKey('jwk', key);
  } catch (error) {
    logger.error('Key export failed.', error);
    throw new Error('Could not export key.');
  }
};

/**
 * Imports a JSON Web Key (JWK) back into a CryptoKey for signing or verification.
 */
export const importKey = async (jwk: JsonWebKey, keyUsage: 'sign' | 'verify'): Promise<CryptoKey> => {
  try {
    return await window.crypto.subtle.importKey(
      'jwk',
      jwk,
      SIGN_ALGORITHM,
      true,
      [keyUsage]
    );
  } catch (error) {
    logger.error(`Key import for usage '${keyUsage}' failed.`, error);
    throw new Error(`Could not import ${keyUsage} key.`);
  }
};

// --- Signing and Verification ---

/**
 * Converts a string to an ArrayBuffer for cryptographic operations.
 */
const stringToBuffer = (str: string): ArrayBuffer => {
  return new TextEncoder().encode(str);
};

/**
 * Creates a signature for a given data string using a private key.
 * @returns The signature as a Base64 encoded string.
 */
export const sign = async (data: string, privateKey: CryptoKey): Promise<string> => {
  try {
    const buffer = stringToBuffer(data);
    const signatureBuffer = await window.crypto.subtle.sign(
      { ...SIGN_ALGORITHM, hash: HASH_ALGORITHM },
      privateKey,
      buffer
    );
    // Convert ArrayBuffer to Base64 string for easy storage
    return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  } catch (error) {
    logger.error('Signing failed.', error);
    throw new Error('Could not sign data.');
  }
};

/**
 * Verifies a signature against the original data and a public key.
 * @param signature - The Base64 encoded signature string.
 */
export const verify = async (data: string, signature: string, publicKey: CryptoKey): Promise<boolean> => {
  try {
    const buffer = stringToBuffer(data);
    // Convert Base64 signature back to ArrayBuffer
    const signatureBuffer = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    
    return await window.crypto.subtle.verify(
      { ...SIGN_ALGORITHM, hash: HASH_ALGORITHM },
      publicKey,
      signatureBuffer,
      buffer
    );
  } catch (error)
  {
    logger.error('Verification failed.', error);
    // Return false on any error (e.g., malformed signature)
    return false;
  }
};

/**
 * Creates a "canonical" string representation of an object for consistent signing.
 * This is crucial because `JSON.stringify` does not guarantee key order.
 * This simple version sorts keys at the top level. For fully nested objects, a more
 * robust recursive implementation would be needed. This is sufficient for our current
 * data structures.
 */
export const createCanonicalString = (obj: Record<string, any>): string => {
    return Object.keys(obj).sort().map(key => {
        if (obj[key] === undefined || obj[key] === null) return `${key}:null`;
        const value = typeof obj[key] === 'object' ? JSON.stringify(obj[key]) : obj[key];
        return `${key}:${value}`;
    }).join('|');
};
