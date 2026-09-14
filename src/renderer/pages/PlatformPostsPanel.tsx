import React, { useState } from 'react';
import { ExternalLink, FolderOpen } from 'lucide-react';
import type { QueueItemDTO } from '../../shared/dto';
import { downloadSize } from '../../shared/listening';
import {
  PLATFORM_NAMES,
  UPLOAD_PAGES,
  approvedForPosting,
  captionFor,
  parsePostLink,
  type OtherPlatform,
  type PlatformPostDTO
} from '../../shared/platformPosts';
import { Banner, Button, CopyField, TextField, TonePill } from '../components/ui';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import styles from './AssistedUploadPanel.module.css';
import own from './PlatformPostsPanel.module.css';

type PostRequest = { type: 'posted'; link: string | null } | { type: 'skip' } | { type: 'restore' };

const LINK_PROBLEM: Record<OtherPlatform, string> = {
  tiktok: 'That is not a link to a TikTok video',
  instagram: 'That is not a link to an Instagram reel or post'
};

const PLACEHOLDER: Record<OtherPlatform, string> = {
  tiktok: 'https://www.tiktok.com/@you/video/…',
  instagram: 'https://www.instagram.com/reel/…'
};

function Step({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className={styles.step}>
      <span className={styles.number} />
      <div className={styles.stepBody}>
        <div className={styles.stepTitle}>{title}</div>
        {text !== undefined && <div className={styles.stepText}>{text}</div>}
        {children}
      </div>
    </div>
  );
}

/** One panel for each platform besides YouTube that this video goes to. Nothing here posts anything by itself. */
export function PlatformPostsPanel({ item }: { item: QueueItemDTO }): React.JSX.Element | null {
  const posts = useApiQuery(() => window.api.platformPostsList(item.id), {
    key: `platform-posts-${item.id}-${item.platforms.join(',')}`,
    invalidateOn: ['queue:changed']
  });
  if (posts.data === null || posts.data.length === 0) return null;
  return (
    <>
      {posts.data.map((post) => (
        <PlatformPost key={post.platform} item={item} post={post} />
      ))}
    </>
  );
}

function PlatformPost({ item, post }: { item: QueueItemDTO; post: PlatformPostDTO }): React.JSX.Element {
  const name = PLATFORM_NAMES[post.platform];
  const [link, setLink] = useState('');
  const prepare = useApiMutation(() => window.api.platformPrepareFile(item.id));
  const reveal = useApiMutation(() => window.api.platformRevealFile(item.id));
  const apply = useApiMutation((request: PostRequest) => window.api.platformPostApply(item.id, post.platform, request), {
    onDone: () => setLink('')
  });

  const approved = approvedForPosting(item);
  const caption = captionFor(item, post.platform);
  const typed = link.trim();
  const linkProblem = typed !== '' && parsePostLink(post.platform, typed) === null ? LINK_PROBLEM[post.platform] : null;
  const when = item.privacy === 'public' && item.scheduled_for !== null ? new Date(item.scheduled_for) : null;
  const file = prepare.data;
  const fileProblems = file === null ? [] : file.problems[post.platform];

  return (
    <section className={styles.panel} aria-label={`Post to ${name}`}>
      <div className={own.head}>
        <h2 className={styles.title}>Post to {name}</h2>
        <TonePill tone={post.state === 'posted' ? 'live' : post.state === 'skipped' ? 'neutral' : 'waiting'}>
          {post.state === 'posted' ? 'Posted' : post.state === 'skipped' ? 'Not posting' : 'Waiting'}
        </TonePill>
      </div>

      {apply.error !== null && (
        <Banner kind="danger" title="That did not work">
          {apply.error}
        </Banner>
      )}

      {post.state === 'posted' && (
        <div className={own.row}>
          <span>{post.postedAt === null ? 'Marked as posted.' : `Marked as posted on ${new Date(post.postedAt).toLocaleString()}.`}</span>
          {post.url !== null && (
            <Button size="small" icon={<ExternalLink size={14} />} onClick={() => void window.api.openExternal(post.url as string)}>
              Open the post
            </Button>
          )}
          <Button size="small" variant="ghost" disabled={apply.pending} onClick={() => void apply.run({ type: 'restore' })}>
            Not posted after all
          </Button>
        </div>
      )}

      {post.state === 'skipped' && (
        <div className={own.row}>
          <span>Not posting this one to {name}.</span>
          <Button size="small" variant="ghost" disabled={apply.pending} onClick={() => void apply.run({ type: 'restore' })}>
            Post it after all
          </Button>
        </div>
      )}

      {post.state === 'waiting' && !approved && (
        <div className={own.row}>
          <span>Approve the video to post it here. Approving covers every platform it goes to.</span>
          <Button size="small" variant="ghost" disabled={apply.pending} onClick={() => void apply.run({ type: 'skip' })}>
            Skip {name} for this video
          </Button>
        </div>
      )}

      {post.state === 'waiting' && approved && (
        <div className={styles.steps}>
          <Step
            title={`Make a file ${name} takes`}
            text="The sound in your render is a kind TikTok and Instagram don’t accept, so ShortStack makes an MP4 copy. It takes a few seconds and is kept for next time."
          >
            <div className={styles.stepActions}>
              {file === null ? (
                <Button size="small" disabled={prepare.pending} onClick={() => void prepare.run()}>
                  {prepare.pending ? 'Making the file…' : 'Make the file'}
                </Button>
              ) : (
                <Button size="small" icon={<FolderOpen size={14} />} onClick={() => void reveal.run()}>
                  Show in folder
                </Button>
              )}
            </div>
            {file !== null && fileProblems.length === 0 && (
              <div className={styles.stepText}>
                Ready{file.sizeBytes === null ? '' : `, ${downloadSize(file.sizeBytes)}`}
                {file.reused ? ', made earlier from this same file' : ''}.
              </div>
            )}
            {fileProblems.length > 0 && (
              <Banner kind="warning" title={`${name} may refuse it`}>
                {fileProblems.join(' ')}
              </Banner>
            )}
            {prepare.error !== null && (
              <Banner kind="danger" title="Could not make the file">
                {prepare.error}
              </Banner>
            )}
            {reveal.error !== null && (
              <Banner kind="danger" title="Could not show it">
                {reveal.error}
              </Banner>
            )}
          </Step>

          <Step title="Copy the caption" text="The title and its hashtags, without the ones that only belong on YouTube.">
            <CopyField label="Caption" value={caption} emptyText="No caption" />
          </Step>

          <Step
            title={`Open ${name}`}
            text={
              when === null
                ? 'Upload the file there and paste the caption.'
                : `Post it around ${when.toLocaleString()}, when it goes out on YouTube, or schedule it in ${name} for then.`
            }
          >
            <div className={styles.stepActions}>
              <Button size="small" icon={<ExternalLink size={14} />} onClick={() => void window.api.openExternal(UPLOAD_PAGES[post.platform])}>
                Open {name}
              </Button>
            </div>
          </Step>

          <Step title="Paste the link once it is up" text="ShortStack keeps it with the video, so the post is easy to find again.">
            <div className={styles.link}>
              <div className={styles.linkInput}>
                <TextField label={`${name} link`} value={link} onChange={setLink} placeholder={PLACEHOLDER[post.platform]} problem={linkProblem} />
              </div>
              <Button
                disabled={typed === '' || linkProblem !== null || apply.pending}
                onClick={() => void apply.run({ type: 'posted', link: typed })}
                style={{ marginTop: 26 }}
              >
                Mark as posted
              </Button>
            </div>
            <div className={styles.stepActions}>
              <Button size="small" variant="ghost" disabled={apply.pending} onClick={() => void apply.run({ type: 'posted', link: null })}>
                Posted, without a link
              </Button>
              <Button size="small" variant="ghost" disabled={apply.pending} onClick={() => void apply.run({ type: 'skip' })}>
                Skip {name} for this video
              </Button>
            </div>
          </Step>
        </div>
      )}
    </section>
  );
}
