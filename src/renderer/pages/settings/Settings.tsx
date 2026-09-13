import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { FormattingSection } from './FormattingSection';
import { IgnoredSettingsBanner } from './IgnoredSettingsBanner';
import { QuotaSection } from './QuotaSection';
import { AiSection, InsightsSection, AppSection, PlatformsSection, UpdatesSection, VersionNote } from './AppSections';
import { ApiModeDialog, AutoApproveDialog, DisconnectDialog } from './Confirmations';
import { ChannelSection, FolderSection } from './ConnectionSections';
import { LegalSection } from './LegalSection';
import { RotationSection, ScheduleSection } from './ScheduleSection';
import { DefaultsSection, UploadMethodSection } from './UploadSections';
import { useIgnoredSettings } from './useIgnoredSettings';
import { useSettings } from './useSettings';
import styles from './Settings.module.css';

export function SettingsPage(): React.JSX.Element {
  const writer = useSettings();
  const ignored = useIgnoredSettings();
  const { hash } = useLocation();
  const [dialog, setDialog] = useState<'auto-approve' | 'api-mode' | 'disconnect' | null>(null);

  // The sidebar links straight to Legal and data; without this the page would open at the top.
  useEffect(() => {
    if (hash === '') return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <>
      <PageHeader title="Settings" />
      <div className={styles.page}>
        <IgnoredSettingsBanner ignored={ignored} />
        <ChannelSection onDisconnect={() => setDialog('disconnect')} />
        <QuotaSection writer={writer} />
        <FolderSection writer={writer} />
        <UploadMethodSection writer={writer} onRequestApiMode={() => setDialog('api-mode')} />
        <DefaultsSection writer={writer} />
        <ScheduleSection writer={writer} onRequestAutoApprove={() => setDialog('auto-approve')} />
        <RotationSection writer={writer} />
        <AiSection writer={writer} />
        <FormattingSection writer={writer} ignored={ignored} />
        <InsightsSection writer={writer} />
        <AppSection writer={writer} />
        <UpdatesSection />
        <PlatformsSection />
        <LegalSection onDisconnect={() => setDialog('disconnect')} />
        <VersionNote />
      </div>

      <AutoApproveDialog open={dialog === 'auto-approve'} writer={writer} onClose={() => setDialog(null)} />
      <ApiModeDialog open={dialog === 'api-mode'} writer={writer} onClose={() => setDialog(null)} />
      <DisconnectDialog open={dialog === 'disconnect'} onClose={() => setDialog(null)} />
    </>
  );
}
