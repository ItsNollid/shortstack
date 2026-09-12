import React from 'react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/ui';

/** Screens still being rebuilt. Saying so plainly beats a half-working page that looks finished. */
export function Placeholder({
  title,
  subtitle,
  next
}: {
  title: string;
  subtitle: string;
  next: string;
}): React.JSX.Element {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState title="Being rebuilt">{next}</EmptyState>
    </>
  );
}
