import React, { useState } from 'react';
import { LEGAL_VERSION, PRIVACY_POLICY, TERMS, type LegalDocument } from '../../../shared/legal';
import { BrandMark } from '../../components/BrandMark';
import { Banner, Button, Dialog } from '../../components/ui';
import styles from './FirstRun.module.css';

/** Nothing else in the app is reachable until this is accepted: the YouTube API Services Developer
 *  Policies require the privacy policy to be agreed before any feature is used, and the terms to
 *  say that using ShortStack means agreeing to YouTube's own terms. */
export function LegalGate({
  onAccept,
  pending,
  problem,
  changes,
  returning
}: {
  onAccept: (version: string) => void;
  pending: boolean;
  problem: string | null;
  /** What changed in the policies since the version this person agreed to. */
  changes: readonly string[];
  /** True when they have agreed before, so this is a re-agreement rather than a first meeting. */
  returning: boolean;
}): React.JSX.Element {
  const [reading, setReading] = useState<LegalDocument | null>(null);
  const [agreed, setAgreed] = useState(false);

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.brand}>
          <BrandMark size={28} />
          <span className={styles.name}>ShortStack</span>
        </div>

        <p className={styles.lead}>
          {returning
            ? 'ShortStack’s privacy policy and terms of use have changed since you last agreed to them. Nothing about how the app works has changed until you agree again.'
            : 'ShortStack helps you queue, approve and schedule short videos for a YouTube channel you control. Before anything else, here is what that involves.'}
        </p>

        {returning && changes.length > 0 && (
          <Banner kind="info" title="What changed">
            <ul className={styles.points}>
              {changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </Banner>
        )}

        <ul className={styles.points}>
          <li>Everything is kept on this computer. There is no ShortStack server and nothing is sent to the developer.</li>
          <li>No video is uploaded, scheduled or published without you approving it first.</li>
          <li>ShortStack uses YouTube API Services, with credentials from your own Google Cloud project.</li>
          <li>You can withdraw its access and delete everything it holds at any time, from Settings.</li>
        </ul>

        <div className={styles.legal}>
          <div className={styles.links}>
            <button type="button" className={styles.link} onClick={() => setReading(PRIVACY_POLICY)}>
              Read the Privacy Policy
            </button>
            <button type="button" className={styles.link} onClick={() => setReading(TERMS)}>
              Read the Terms of Use
            </button>
            <button
              type="button"
              className={styles.link}
              onClick={() => void window.api.openExternal('https://www.youtube.com/t/terms')}
            >
              YouTube Terms of Service
            </button>
            <button
              type="button"
              className={styles.link}
              onClick={() => void window.api.openExternal('https://policies.google.com/privacy')}
            >
              Google Privacy Policy
            </button>
          </div>

          <label className={styles.agree}>
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            <span className={styles.agreeText}>
              I have read and agree to ShortStack&apos;s Privacy Policy and Terms of Use, and I agree to
              the YouTube Terms of Service.
            </span>
          </label>
        </div>

        {problem !== null && (
          <Banner kind="danger" title="Could not save that">
            {problem}
          </Banner>
        )}

        <div className={styles.actions}>
          <Button variant="primary" disabled={!agreed || pending} onClick={() => onAccept(LEGAL_VERSION)}>
            {pending ? 'Saving…' : returning ? 'Agree to the updated policies' : 'Agree and continue'}
          </Button>
        </div>
      </div>

      <Dialog open={reading !== null} title={reading?.title ?? ''} onClose={() => setReading(null)}>
        {reading !== null && (
          <>
            <div className={styles.stepText}>Last updated {reading.updated}</div>
            {reading.sections.map((section) => (
              <div key={section.heading}>
                <div className={styles.stepTitle}>{section.heading}</div>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className={styles.stepText}>
                    {paragraph}
                  </p>
                ))}
              </div>
            ))}
          </>
        )}
      </Dialog>
    </div>
  );
}
