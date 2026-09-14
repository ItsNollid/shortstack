import { describe, expect, it } from 'vitest';
import { challengeBase64Url, challengeHex, createState, createVerifier, isValidVerifier, VERIFIER_LENGTH } from './pkce';

// RFC 7636, appendix B.
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

describe('the challenge', () => {
  it('matches the worked example in RFC 7636', () => {
    expect(challengeBase64Url(RFC_VERIFIER)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('is the same digest in hex for TikTok', () => {
    const hex = challengeHex(RFC_VERIFIER);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(hex, 'hex').toString('base64url')).toBe(challengeBase64Url(RFC_VERIFIER));
  });
});

describe('the verifier', () => {
  it('is long enough and uses only the characters the RFC allows', () => {
    const verifier = createVerifier();
    expect(verifier).toHaveLength(VERIFIER_LENGTH);
    expect(isValidVerifier(verifier)).toBe(true);
    expect(isValidVerifier(RFC_VERIFIER)).toBe(true);
  });

  it('is different every time', () => {
    expect(createVerifier()).not.toBe(createVerifier());
  });

  it('skips bytes that would make some characters likelier than others', () => {
    // 252 and above would wrap onto the first few characters; they are thrown away and more are drawn.
    let call = 0;
    const random = (size: number): Buffer => Buffer.alloc(size, call++ === 0 ? 255 : 0);
    expect(createVerifier(random, 43)).toBe('A'.repeat(43));
    expect(call).toBe(2);
  });

  it('refuses what the RFC does not allow', () => {
    expect(isValidVerifier('short')).toBe(false);
    expect(isValidVerifier(`${'a'.repeat(42)}!`)).toBe(false);
    expect(isValidVerifier('a'.repeat(129))).toBe(false);
  });
});

describe('the state', () => {
  it('is unguessable and safe in a URL', () => {
    const state = createState();
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(createState()).not.toBe(state);
  });
});
