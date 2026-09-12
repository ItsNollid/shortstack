import React from 'react';

/** The ShortStack mark: three stacked clips, deliberately nothing like a play button so the app
 *  is never mistaken for YouTube itself (Developer Policies III.I.1 and the Branding Guidelines). */
export function BrandMark({ size = 20 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="ShortStack">
      <rect width="24" height="24" rx="7" fill="var(--brand)" />
      <rect x="6" y="5.5" width="12" height="3.4" rx="1.7" fill="#ffffff" opacity="0.55" />
      <rect x="6" y="10.3" width="12" height="3.4" rx="1.7" fill="#ffffff" opacity="0.8" />
      <rect x="6" y="15.1" width="12" height="3.4" rx="1.7" fill="#ffffff" />
    </svg>
  );
}
