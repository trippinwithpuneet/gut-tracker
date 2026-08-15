import { describe, expect, it } from 'vitest';
import { libraryId, sha1, uuidv4, uuidv5, uuidv5WithNamespace, __testing } from './uuid';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('sha1', () => {
  // FIPS 180-1 / RFC 3174 vectors. These are the whole reason this file has tests:
  // a subtly wrong SHA-1 would still produce stable-looking ids, and the breakage
  // would only show up as orphaned entries after a local-to-cloud migration.
  it('matches the empty-string vector', () => {
    expect(hex(sha1(utf8('')))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('matches the "abc" vector', () => {
    expect(hex(sha1(utf8('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  it('matches the 56-byte vector that forces a second block', () => {
    const input = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
    expect(input.length).toBe(56);
    expect(hex(sha1(utf8(input)))).toBe('84983e441c3bd26ebaae4aa1f95129e5e54670f1');
  });

  it('matches the million-a vector', () => {
    expect(hex(sha1(utf8('a'.repeat(1_000_000))))).toBe(
      '34aa973cd4c4daa4f61eeb2bdbad27316534016f'
    );
  });

  it('handles multibyte input', () => {
    expect(hex(sha1(utf8('héllo · 日本')))).toHaveLength(40);
  });
});

describe('uuidv5', () => {
  // RFC 4122 Appendix B style vector, using the standard DNS namespace.
  it('matches the DNS-namespace vector', () => {
    const dns = __testing.parseUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    expect(uuidv5WithNamespace(dns, 'www.example.com')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2'
    );
  });

  it('sets version 5 and the RFC 4122 variant', () => {
    const id = uuidv5('anything');
    expect(id[14]).toBe('5');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('is deterministic and slug-sensitive', () => {
    expect(uuidv5('dairy')).toBe(uuidv5('dairy'));
    expect(uuidv5('dairy')).not.toBe(uuidv5('dairyy'));
  });
});

describe('libraryId', () => {
  it('keeps symptoms and tags apart even when slugs collide', () => {
    expect(libraryId('symptom', 'bloating')).not.toBe(libraryId('tag', 'bloating'));
  });

  it('is stable across calls', () => {
    expect(libraryId('tag', 'eggs')).toBe(libraryId('tag', 'eggs'));
  });
});

describe('uuidv4', () => {
  it('produces distinct, well-formed v4 ids', () => {
    const a = uuidv4();
    const b = uuidv4();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
