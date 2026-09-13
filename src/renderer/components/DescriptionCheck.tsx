// Spelling, grammar and hashtag problems under a description box, each with its own fix, and one
// button that applies every fix safe to apply without asking — with an undo, because "safe" is still
// a judgement made by rules.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  applyIssues,
  applyReplacement,
  checkDescription,
  checkerVocabulary,
  fixAll,
  issueKey,
  type CheckContext,
  type CheckGroup,
  type CheckIssue,
  type CheckRule
} from '../../shared/descriptionCheck';
import { useAppStatus } from '../app/status';
import { useSettings } from '../pages/settings/useSettings';
import { useLexicon } from '../spelling/lexicon';
import { Button } from './ui';
import styles from './DescriptionCheck.module.css';

const GROUP_TITLES: Readonly<Record<CheckGroup, string>> = {
  upload: 'Will not upload',
  hashtags: 'Hashtags',
  spelling: 'Spelling',
  grammar: 'Grammar'
};
const GROUP_ORDER: readonly CheckGroup[] = ['upload', 'hashtags', 'spelling', 'grammar'];

/** Shown as one line naming every hashtag it applies to, rather than a line for each. */
const TOGETHER: ReadonlySet<CheckRule> = new Set([
  'double_hash',
  'hashtag_commas',
  'duplicate_hashtag',
  'other_platform',
  'other_game',
  'too_many_hashtags'
]);

/** Long enough that a burst of typing is checked once, short enough to feel live. */
const CHECK_DELAY_MS = 250;
/** Rounds of re-checking when fixing one kind of problem, as removing one hashtag can shift the next. */
const MAX_ROUNDS = 8;

export interface DescriptionCheckProps {
  text: string;
  onChange: (next: string) => void;
  game: string | null;
  disabled?: boolean;
  /** A single line with Fix all, and the details a click away, for screens with little room. */
  compact?: boolean;
  /** The description box itself, so a problem clicked in the list can be selected in it. */
  children: React.ReactNode;
}

interface Row {
  key: string;
  rule: CheckRule;
  issues: CheckIssue[];
}

export function DescriptionCheck({
  text,
  onChange,
  game,
  disabled = false,
  compact = false,
  children
}: DescriptionCheckProps): React.JSX.Element {
  const { settings, auth } = useAppStatus();
  const writer = useSettings();
  const box = useRef<HTMLDivElement>(null);
  const spellWords = settings?.spell_words;
  const channel = auth?.channel ?? null;
  const words = useMemo(
    () => checkerVocabulary([...(spellWords ?? []), channel?.title, channel?.handle?.replace(/^@/, ''), game]),
    [spellWords, channel?.title, channel?.handle, game]
  );
  const { lexicon, failed, version } = useLexicon(words);

  const [checked, setChecked] = useState(text);
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(() => new Set());
  const [undo, setUndo] = useState<{ before: string; after: string; count: number } | null>(null);
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    const timer = window.setTimeout(() => setChecked(text), CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const maxHashtags = settings?.format_max_hashtags ?? 0;
  // `version` stands for what the lexicon knows, which changes without the lexicon object changing.
  const context = useMemo<CheckContext>(() => ({ lexicon, game, maxHashtags }), [lexicon, game, maxHashtags, version]);
  const skip = (issue: CheckIssue): boolean => ignored.has(issueKey(issue));
  const issues = useMemo(
    () => checkDescription(checked, context).filter((issue) => !ignored.has(issueKey(issue))),
    [checked, context, ignored]
  );
  // Positions are only good for the text they were found in; while typing catches up, nothing is clickable.
  const current = checked === text;
  const locked = disabled || !current;
  const safe = issues.filter((issue) => issue.auto).length;

  const rows = useMemo(() => {
    const byGroup = new Map<CheckGroup, Row[]>();
    for (const issue of issues) {
      const list = byGroup.get(issue.group) ?? [];
      const together = TOGETHER.has(issue.rule) ? list.find((row) => row.rule === issue.rule) : undefined;
      if (together !== undefined) together.issues.push(issue);
      else list.push({ key: issue.id, rule: issue.rule, issues: [issue] });
      byGroup.set(issue.group, list);
    }
    return byGroup;
  }, [issues]);

  const change = (next: string): void => {
    if (next === text) return;
    setChecked(next);
    onChange(next);
  };

  const fixEverything = (): void => {
    const result = fixAll(text, context, skip);
    if (result.text === text) return;
    setUndo({ before: text, after: result.text, count: result.fixed });
    change(result.text);
  };

  const fixRule = (rule: CheckRule): void => {
    let next = text;
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const matching = checkDescription(next, context).filter((issue) => issue.rule === rule && !skip(issue));
      const applied = applyIssues(next, matching);
      if (applied.text === next) break;
      next = applied.text;
    }
    change(next);
  };

  const select = (issue: CheckIssue): void => {
    const textarea = box.current?.querySelector('textarea');
    if (textarea === null || textarea === undefined || !current) return;
    textarea.focus();
    textarea.setSelectionRange(issue.start, issue.end);
  };

  const ignore = (found: readonly CheckIssue[]): void => setIgnored(new Set([...ignored, ...found.map(issueKey)]));

  const addWord = (word: string): void => {
    const clean = word.replace(/’/g, "'").replace(/'s$/i, '');
    const existing = settings?.spell_words ?? [];
    if (existing.some((each) => each.toLowerCase() === clean.toLowerCase())) return;
    writer.set('spell_words', [...existing, clean]);
  };

  const loadingNote = failed ? ' · spelling could not load' : lexicon === null ? ' · loading the dictionary' : '';
  const summary = issues.length === 0 ? `Nothing to fix${loadingNote}` : `${issues.length} to look at${loadingNote}`;

  return (
    <div className={styles.wrap} ref={box}>
      {children}
      <section
        className={styles.check}
        aria-label="Description check"
        // A click here must not take focus from the box. Where a box saves when it loses focus, that
        // save and the fix's own would race, and the second is refused as out of date.
        onMouseDown={(event) => {
          if (event.target instanceof Element && event.target.closest('button') !== null) event.preventDefault();
        }}
      >
        <div className={styles.head}>
          <span className={issues.length === 0 ? styles.clean : styles.summary}>
            {issues.length === 0 && <Check size={14} aria-hidden />}
            {summary}
          </span>
          {undo !== null && text === undo.after && (
            <span className={styles.undo}>
              Fixed {undo.count}
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  change(undo.before);
                  setUndo(null);
                }}
              >
                Undo
              </button>
            </span>
          )}
          {compact && issues.length > 0 && (
            <button type="button" className={styles.link} onClick={() => setOpen(!open)}>
              {open ? 'Hide' : 'Show'}
            </button>
          )}
          <Button
            size="small"
            variant={safe > 0 ? 'primary' : 'secondary'}
            icon={<Sparkles size={14} aria-hidden />}
            disabled={disabled || safe === 0}
            onClick={fixEverything}
          >
            {safe > 0 ? `Fix all (${safe})` : 'Fix all'}
          </Button>
        </div>

        {open &&
          GROUP_ORDER.map((group) => {
            const list = rows.get(group);
            if (list === undefined) return null;
            return (
              <div key={group} className={styles.group}>
                <div className={styles.groupTitle}>{GROUP_TITLES[group]}</div>
                {list.map((row) =>
                  TOGETHER.has(row.rule) ? (
                    <TogetherRow
                      key={row.key}
                      row={row}
                      locked={locked}
                      onFix={() => fixRule(row.rule)}
                      onSelect={select}
                      onIgnore={() => ignore(row.issues)}
                    />
                  ) : (
                    <SingleRow
                      key={row.key}
                      issue={row.issues[0] as CheckIssue}
                      text={checked}
                      locked={locked}
                      onReplace={(issue, replacement) => change(applyReplacement(text, issue, replacement))}
                      onSelect={select}
                      onIgnore={(issue) => ignore([issue])}
                      onAddWord={addWord}
                    />
                  )
                )}
              </div>
            );
          })}
      </section>
    </div>
  );
}

function TogetherRow({
  row,
  locked,
  onFix,
  onSelect,
  onIgnore
}: {
  row: Row;
  locked: boolean;
  onFix: () => void;
  onSelect: (issue: CheckIssue) => void;
  onIgnore: () => void;
}): React.JSX.Element {
  const first = row.issues[0] as CheckIssue;
  const shown = row.issues.slice(0, 12);
  const label =
    row.rule === 'hashtag_commas'
      ? 'Use spaces'
      : row.rule === 'double_hash'
        ? 'Fix'
        : row.issues.length === 1
          ? 'Remove it'
          : `Remove all ${row.issues.length}`;
  return (
    <div className={styles.row}>
      <div className={styles.message}>{first.message}</div>
      {row.rule !== 'hashtag_commas' && (
        <div className={styles.chips}>
          {shown.map((issue) => (
            <button key={issue.id} type="button" className={styles.chip} disabled={locked} onClick={() => onSelect(issue)}>
              {issue.found.trim()}
            </button>
          ))}
          {row.issues.length > shown.length && <span className={styles.more}>and {row.issues.length - shown.length} more</span>}
        </div>
      )}
      <div className={styles.actions}>
        <Button size="small" disabled={locked} onClick={onFix}>
          {label}
        </Button>
        <button type="button" className={styles.link} onClick={onIgnore}>
          Ignore
        </button>
      </div>
    </div>
  );
}

const REPLACEMENT_LABELS: Partial<Record<CheckRule, string>> = {
  space_before_punctuation: 'Remove the space',
  double_space: 'One space',
  missing_space: 'Add a space',
  repeated_word: 'Remove the repeat'
};

function SingleRow({
  issue,
  text,
  locked,
  onReplace,
  onSelect,
  onIgnore,
  onAddWord
}: {
  issue: CheckIssue;
  text: string;
  locked: boolean;
  onReplace: (issue: CheckIssue, replacement: string) => void;
  onSelect: (issue: CheckIssue) => void;
  onIgnore: (issue: CheckIssue) => void;
  onAddWord: (word: string) => void;
}): React.JSX.Element {
  return (
    <div className={styles.row}>
      <div className={styles.line}>
        <button type="button" className={styles.found} disabled={locked} onClick={() => onSelect(issue)} title="Show it in the description">
          <Snippet text={text} issue={issue} />
        </button>
        <span className={styles.message}>{issue.message}</span>
      </div>
      <div className={styles.actions}>
        {issue.replacements.map((replacement) => (
          <Button key={replacement} size="small" disabled={locked} onClick={() => onReplace(issue, replacement)}>
            {REPLACEMENT_LABELS[issue.rule] ?? (replacement === '' ? 'Remove' : replacement)}
          </Button>
        ))}
        {issue.rule === 'misspelled' && (
          <button type="button" className={styles.link} onClick={() => onAddWord(issue.found)}>
            Add to dictionary
          </button>
        )}
        <button type="button" className={styles.link} onClick={() => onIgnore(issue)}>
          Ignore
        </button>
      </div>
    </div>
  );
}

/** The problem in its surroundings, so a stray space or a single letter can be seen for what it is. */
function Snippet({ text, issue }: { text: string; issue: CheckIssue }): React.JSX.Element {
  const lineStart = text.lastIndexOf('\n', issue.start - 1) + 1;
  const nextBreak = text.indexOf('\n', issue.end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const from = Math.max(lineStart, issue.start - 24);
  const to = Math.min(lineEnd, issue.end + 24);
  const visible = issue.found.replace(/ /g, '␣');
  return (
    <>
      {from > lineStart && '…'}
      {text.slice(from, issue.start)}
      <mark className={styles.mark}>{visible === '' ? '␣' : visible}</mark>
      {text.slice(issue.end, to)}
      {to < lineEnd && '…'}
    </>
  );
}
