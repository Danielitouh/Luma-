// Server-only callers. Each ciphertext is bound to its owner's identity.
const encoder = new TextEncoder();
async function encryptionKey(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('Secure key storage is unavailable.');
  const bytes = Uint8Array.from(secret.match(/../g)!, pair => parseInt(pair, 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function encode(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function decode(value: string) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
export async function encryptAIKey(value: string, owner: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: encoder.encode(owner)}, await encryptionKey(secret), encoder.encode(value));
  return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}
export async function decryptAIKey(value: string, owner: string, secret: string) {
  const [version, iv, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !ciphertext) throw new Error('Saved key is unavailable.');
  const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: decode(iv), additionalData: encoder.encode(owner)}, await encryptionKey(secret), decode(ciphertext));
  return new TextDecoder().decode(plaintext);
}
