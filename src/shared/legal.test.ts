import { describe, expect, it } from 'vitest';
import { LEGAL_VERSION, PRIVACY_POLICY, TERMS, type LegalDocument } from './legal';

const text = (document: LegalDocument): string =>
  document.sections.flatMap((section) => [section.heading, ...section.paragraphs]).join('\n');

describe('bundled legal documents', () => {
  it('are versioned and non-empty', () => {
    for (const document of [PRIVACY_POLICY, TERMS]) {
      expect(document.updated).toBe(LEGAL_VERSION);
      expect(document.sections.length).toBeGreaterThan(2);
      for (const section of document.sections) expect(section.paragraphs.length).toBeGreaterThan(0);
    }
  });

  // The Developer Policies name these specifically; a future trim should fail here, not at audit.
  it('cover what the YouTube API Services Developer Policies require of a privacy policy', () => {
    const policy = text(PRIVACY_POLICY);
    expect(policy).toContain('YouTube API Services');
    expect(policy).toContain('https://policies.google.com/privacy');
    expect(policy).toContain('https://www.youtube.com/t/terms');
    expect(policy).toContain('https://myaccount.google.com/permissions');
    expect(policy).toContain('30 days');
    expect(policy.toLowerCase()).toContain('not affiliated');
  });

  it('state that the user agrees to the YouTube Terms of Service', () => {
    expect(text(TERMS)).toContain('https://www.youtube.com/t/terms');
  });

  it('say plainly that nothing is published without approval', () => {
    expect(text(TERMS).toLowerCase()).toContain('without you approving it first');
  });
});
