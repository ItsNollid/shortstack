// Accepts whatever the user pastes: a Shorts link, a watch link, a share link, or a bare id.
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  if (ID_PATTERN.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(url.hostname)) return null;

  const fromQuery = url.searchParams.get('v');
  if (fromQuery !== null && ID_PATTERN.test(fromQuery)) return fromQuery;

  const segments = url.pathname.split('/').filter((segment) => segment !== '');
  const last = segments[segments.length - 1] ?? '';
  return ID_PATTERN.test(last) ? last : null;
}
