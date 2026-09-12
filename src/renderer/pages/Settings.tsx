import React from 'react';
import { Placeholder } from './Placeholder';

export function SettingsPage(): React.JSX.Element {
  return (
    <Placeholder
      title="Settings"
      subtitle="Channel, folder, upload defaults, schedule and your data"
      next="Connecting a channel, choosing a folder and setting upload defaults are next, along with Legal & data."
    />
  );
}
