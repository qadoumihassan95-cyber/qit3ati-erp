import * as crypto from 'node:crypto';

/**
 * AES-256-GCM symmetric encryption for storing JoFotara secret keys at rest.
 *
 * Master key MUST be supplied via env `JOFOTARA_MASTER_KEY` as a hex string.
 * The key must be 32 bytes (64 hex chars). Generate one with:
 *
 *     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Set it once on Render and NEVER rotate without re-encrypting all rows.
 *
 * Storage format (single string): `<iv-hex>:<authTag-hex>:<ciphertext-hex>`
 *   - iv:        12 bytes (96 bits, GCM standard)
 *   - authTag:   16 bytes
 *   - ciphertext: variable
 *
 * Why GCM? Provides confidentiality + integrity in one shot. Tampering with
 * the ciphertext (or IV) makes decryption throw, so we can't be tricked into
 * sending an attacker-modified secret key to JoFotara.
 */

const IV_LEN = 12;       // GCM standard
const TAG_LEN = 16;
const ALGO = 'aes-256-gcm';

function loadKey(): Buffer {
  const raw = process.env.JOFOTARA_MASTER_KEY;
  if (!raw) {
    // Don't crash boot — but every encrypt/decrypt will fail loudly so the
    // operator notices. Better than silently writing plaintext or panicking
    // the entire API on cold start.
    throw new Error(
      'JOFOTARA_MASTER_KEY is not set. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
        'and set it on Render before submitting JoFotara invoices.',
    );
  }
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== 32) {
    throw new Error(`JOFOTARA_MASTER_KEY must be 32 bytes (64 hex chars), got ${buf.length}`);
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv  = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

export function decryptSecret(blob: string): string {
  const key = loadKey();
  const parts = blob.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted secret format');
  const [ivHex, tagHex, ctHex] = parts;
  if (!ivHex || !tagHex || !ctHex) throw new Error('Invalid encrypted secret parts');
  const iv  = Buffer.from(ivHex,  'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct  = Buffer.from(ctHex,  'hex');
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error('Invalid IV or tag length');
  }
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString('utf8');
}

/** Last 4 chars of the plain secret — safe to surface in the UI. */
export function maskTail(plain: string): string {
  if (!plain) return '';
  return plain.slice(-4);
}
