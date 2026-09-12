import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { PRIVACY_POLICY, TERMS, type LegalDocument } from '../../../shared/legal';
import { Button, Dialog } from '../../components/ui';
import { Section } from './parts';
import styles from './Settings.module.css';

const EXTERNAL = [
  { label: 'YouTube Terms of Service', url: 'https://www.youtube.com/t/terms' },
  { label: 'Google Privacy Policy', url: 'https://policies.google.com/privacy' },
  { label: 'Apps with access to your Google account', url: 'https://myaccount.google.com/permissions' }
];

function LegalDialog({ document, onClose }: { document: LegalDocument | null; onClose: () => void }): React.JSX.Element {
  return (
    <Dialog open={document !== null} title={document?.title ?? ''} onClose={onClose}>
      {document !== null && (
        <>
          <div className={styles.sectionText}>Last updated {document.updated}</div>
          {document.sections.map((section) => (
            <div key={section.heading}>
              <div className={styles.choiceTitle}>{section.heading}</div>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className={styles.sectionText}>
                  {paragraph}
                </p>
              ))}
            </div>
          ))}
        </>
      )}
    </Dialog>
  );
}

export function LegalSection({ onDisconnect }: { onDisconnect: () => void }): React.JSX.Element {
  const [showing, setShowing] = useState<LegalDocument | null>(null);

  return (
    <Section
      id="legal"
      title="Legal and data"
      text="ShortStack keeps everything on this computer. Nothing is sent to the developer."
    >
      <div className={styles.links}>
        <button type="button" className={styles.link} onClick={() => setShowing(PRIVACY_POLICY)}>
          ShortStack Privacy Policy
        </button>
        <button type="button" className={styles.link} onClick={() => setShowing(TERMS)}>
          ShortStack Terms of Use
        </button>
        {EXTERNAL.map((entry) => (
          <button
            key={entry.url}
            type="button"
            className={styles.link}
            onClick={() => void window.api.openExternal(entry.url)}
          >
            {entry.label} <ExternalLink size={12} />
          </button>
        ))}
      </div>

      <div className={styles.row}>
        <Button variant="danger" onClick={onDisconnect}>
          Disconnect and delete YouTube data
        </Button>
      </div>

      <LegalDialog document={showing} onClose={() => setShowing(null)} />
    </Section>
  );
}
