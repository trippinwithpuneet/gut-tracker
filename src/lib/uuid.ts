/**
 * Deterministic UUIDv5 (RFC 4122 §4.3), isomorphic and synchronous.
 *
 * The curated symptom and food-tag libraries need identical ids in three places:
 * the browser's local store, the Postgres seed, and any exported JSON file. Deriving
 * the id from the slug means all three agree without anyone maintaining a list of
 * literal UUIDs — and it makes a local-to-cloud migration a straight copy, because
 * a meal tagged `dairy` offline points at the same row once it reaches the server.
 *
 * SHA-1 is implemented here rather than pulled from node:crypto or WebCrypto because
 * this runs in the browser, in Node scripts, and in tests, and WebCrypto's digest is
 * async — which would infect every call site that just wants an id for a slug.
 * SHA-1 is used only as RFC 4122 specifies; nothing here is security-sensitive.
 *
 * Consequence worth knowing: a slug is permanent identity. Renaming `dairy` to
 * `dairy-products` orphans every entry tagged with it. Change labels freely, never slugs.
 */

/** Fixed namespace for this project. Changing it re-keys every curated row. */
const NAMESPACE = 'a3f1c2d4-6b78-4e9a-8c1d-5f2e7b904a63';

function parseUuid(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

const NAMESPACE_BYTES = parseUuid(NAMESPACE);

/** SHA-1 of a byte array, returned as 20 bytes. */
export function sha1(bytes: Uint8Array): Uint8Array {
  const bitLength = bytes.length * 8;
  // Smallest multiple of 64 that leaves room for the 0x80 marker and an 8-byte length.
  const total = (((bytes.length + 8) >>> 6) << 6) + 64;

  const msg = new Uint8Array(total);
  msg.set(bytes);
  msg[bytes.length] = 0x80;

  const view = new DataView(msg.buffer);
  view.setUint32(total - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(total - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (n << 1) | (n >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + (f >>> 0) + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0);
  outView.setUint32(4, h1);
  outView.setUint32(8, h2);
  outView.setUint32(12, h3);
  outView.setUint32(16, h4);
  return out;
}

/** UUIDv5 of `name` within an arbitrary namespace. Exported so tests can check RFC vectors. */
export function uuidv5WithNamespace(namespaceBytes: Uint8Array, name: string): string {
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes, 0);
  input.set(nameBytes, namespaceBytes.length);

  const hash = sha1(input).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  return formatUuid(hash);
}

/** UUIDv5 of `name` within this project's namespace. */
export function uuidv5(name: string): string {
  return uuidv5WithNamespace(NAMESPACE_BYTES, name);
}

export const __testing = { parseUuid };

/**
 * Stable id for a curated library row. Namespacing by kind keeps a symptom and a
 * food tag that happen to share a slug from colliding.
 */
export function libraryId(kind: 'symptom' | 'tag', slug: string): string {
  return uuidv5(`${kind}:${slug}`);
}

/** Random v4 id for user-created rows, with a fallback for older browsers. */
export function uuidv4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}
