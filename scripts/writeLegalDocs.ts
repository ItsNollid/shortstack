// Writes the hostable copies of the policy and terms from the same source the app displays, so the
// published pages and the in-app text can never disagree. Run with: npm run docs:legal
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { PRIVACY_POLICY, TERMS, type LegalDocument } from '../src/shared/legal';

const render = (document: LegalDocument): string => {
  const lines = [`# ${document.title}`, '', `_Last updated ${document.updated}_`, ''];
  for (const section of document.sections) {
    lines.push(`## ${section.heading}`, '');
    for (const paragraph of section.paragraphs) lines.push(paragraph, '');
  }
  lines.push('---', '', '_This page is generated from the text bundled in the app. Edit `src/shared/legal.ts`._', '');
  return lines.join('\n');
};

const out = path.join(__dirname, '..', 'docs', 'legal');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'privacy-policy.md'), render(PRIVACY_POLICY));
writeFileSync(path.join(out, 'terms.md'), render(TERMS));
console.log('Wrote docs/legal/privacy-policy.md and docs/legal/terms.md');
