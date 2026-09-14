// Proof Key for Code Exchange: the app proves at the token exchange that it is the one that started the
// sign-in, without keeping a client secret on the user's computer, where it would not stay secret.
//
// Two ways of writing the challenge. RFC 7636 uses base64url of the SHA-256 digest, which Instagram's login
// follows. TikTok's Login Kit for desktop apps documents a hex-encoded digest instead — sending the RFC form
// there fails the exchange with an unhelpful error, so each platform asks for the form it documents.
import { createHash, randomBytes } from 'crypto';

/** RFC 7636 section 4.1: 43 to 128 characters from the unreserved set. */
const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
export const VERIFIER_LENGTH = 64;

export function isValidVerifier(verifier: string): boolean {
  return verifier.length >= 43 && verifier.length <= 128 && [...verifier].every((character) => UNRESERVED.includes(character));
}

/**
 * A fresh verifier. Rejection sampling rather than a modulo, so every character is equally likely: the
 * unreserved set has 66 characters, and 256 is not a multiple of 66.
 */
export function createVerifier(random: (size: number) => Buffer = randomBytes, length = VERIFIER_LENGTH): string {
  const limit = 256 - (256 % UNRESERVED.length);
  let verifier = '';
  while (verifier.length < length) {
    for (const byte of random(length)) {
      if (byte >= limit) continue;
      verifier += UNRESERVED[byte % UNRESERVED.length];
      if (verifier.length === length) break;
    }
  }
  return verifier;
}

const digest = (verifier: string): Buffer => createHash('sha256').update(verifier, 'ascii').digest();

/** The RFC 7636 S256 challenge: base64url, no padding. */
export const challengeBase64Url = (verifier: string): string => digest(verifier).toString('base64url');

/** The same digest written as lowercase hex, as TikTok's desktop Login Kit documents it. */
export const challengeHex = (verifier: string): string => digest(verifier).toString('hex');

/** An unguessable value tying a sign-in's answer to the request that started it. */
export const createState = (random: (size: number) => Buffer = randomBytes): string => random(24).toString('base64url');
