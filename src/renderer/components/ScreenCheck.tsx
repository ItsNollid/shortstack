import React from 'react';
import { SCENE_NOUNS, joinScenes } from '../../shared/sceneCopy';
import { checkTitleAgainstScreen } from '../../shared/titlePromise';
import { useVideoReport } from '../hooks/useVideoReport';
import { Banner } from './ui';

export interface ScreenCheckProps {
  queueId: number;
  /** The title as it stands in the form, so the check follows what is being typed. */
  title: string;
  /** Also say when the first second is empty. Off where the full panel beside it already says so. */
  withHook?: boolean;
}

/** What the stills say against the title, and optionally the opening. Nothing at all until the model has looked. */
export function ScreenCheck({ queueId, title, withHook = false }: ScreenCheckProps): React.JSX.Element | null {
  const report = useVideoReport(queueId).data;
  if (report === null) return null;

  const mismatch = checkTitleAgainstScreen(title, report);
  const hook = withHook && report.hook?.weak === true ? report.hook : null;
  if (mismatch === null && hook === null) return null;

  return (
    <>
      {mismatch !== null && (
        <Banner kind="warning" title={`The title promises “${mismatch.promise}”`}>
          None of the {mismatch.stills} stills the model looked at shows play, only {joinScenes(mismatch.shown)}. Either
          the moment falls between the stills, or the title promises something this clip does not have.
        </Banner>
      )}
      {hook !== null && (
        <Banner kind="warning" title="Nothing happens in the first second">
          It opens on {SCENE_NOUNS[hook.scene]}. People decide whether to keep watching in about that long.
        </Banner>
      )}
    </>
  );
}
