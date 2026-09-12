// YouTube's assignable video categories for the US region. The ids are stable worldwide; the
// labels are what the user picks from. Kept local so choosing a category needs no API call.
export const VIDEO_CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: '1', label: 'Film & Animation' },
  { id: '2', label: 'Autos & Vehicles' },
  { id: '10', label: 'Music' },
  { id: '15', label: 'Pets & Animals' },
  { id: '17', label: 'Sports' },
  { id: '19', label: 'Travel & Events' },
  { id: '20', label: 'Gaming' },
  { id: '22', label: 'People & Blogs' },
  { id: '23', label: 'Comedy' },
  { id: '24', label: 'Entertainment' },
  { id: '25', label: 'News & Politics' },
  { id: '26', label: 'Howto & Style' },
  { id: '27', label: 'Education' },
  { id: '28', label: 'Science & Technology' },
  { id: '29', label: 'Nonprofits & Activism' }
];

export const DEFAULT_CATEGORY_ID = '22';

export function categoryLabel(id: string): string {
  return VIDEO_CATEGORIES.find((category) => category.id === id)?.label ?? `Category ${id}`;
}
