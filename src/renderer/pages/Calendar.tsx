import React from 'react';
import { Placeholder } from './Placeholder';

export function Calendar(): React.JSX.Element {
  return (
    <Placeholder
      title="Calendar"
      subtitle="Drag approved videos onto a day to set when they publish"
      next="The month grid and drag-and-drop scheduling land next. Until then, times are filled in automatically from your daily slots."
    />
  );
}
