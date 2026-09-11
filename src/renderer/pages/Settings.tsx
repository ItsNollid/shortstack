import React, { useState, useEffect } from 'react';
import TagInput from '../components/TagInput';

export default function Settings() {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const s = await window.api.getSettings();
    setSettings(s || {});
    setLoading(false);
  };

  const updateSetting = async (key: string, value: any) => {
    await window.api.setSetting(key, value);
    setSettings({ ...settings, [key]: value });
  };

  const handleSelectFolder = async () => {
    const folder = await window.api.selectFolder();
    if (folder) updateSetting('shorts_folder', folder);
  };

  if (loading) return <div className="page-container">Loading settings...</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '800px' }}>
        
        {/* Folders Section */}
        <section className="settings-section" style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ marginBottom: '16px' }}>Folders</h3>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Shorts Folder (Monitor for new videos)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" readOnly value={settings.shorts_folder || ''} />
              <button className="btn-secondary" onClick={handleSelectFolder}>Browse</button>
            </div>
          </div>
        </section>

        {/* Defaults Section */}
        <section className="settings-section" style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ marginBottom: '16px' }}>Upload Defaults</h3>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Default Title Template</label>
            <input 
              type="text" 
              value={settings.default_title_template || '{filename}'} 
              onChange={(e) => updateSetting('default_title_template', e.target.value)} 
            />
            <small style={{ color: 'var(--text-muted)' }}>Use {'{filename}'} to insert original filename</small>
          </div>
          
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Default Description</label>
            <textarea 
              rows={4} 
              value={settings.default_description || ''} 
              onChange={(e) => updateSetting('default_description', e.target.value)} 
            />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Default Tags</label>
            <TagInput 
              tags={typeof settings.default_tags === 'string' ? (() => { try { return JSON.parse(settings.default_tags); } catch { return []; } })() : (settings.default_tags || [])} 
              onChange={(tags) => updateSetting('default_tags', tags)} 
            />
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Default Privacy</label>
              <select value={settings.default_privacy || 'private'} onChange={(e) => updateSetting('default_privacy', e.target.value)}>
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
            </div>
            
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Made for Kids</label>
              <select value={settings.made_for_kids ? 'true' : 'false'} onChange={(e) => updateSetting('made_for_kids', e.target.value === 'true')}>
                <option value="false">No, not made for kids</option>
                <option value="true">Yes, made for kids</option>
              </select>
            </div>
          </div>
        </section>

        {/* Schedule Section */}
        <section className="settings-section" style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ marginBottom: '16px' }}>Schedule & Automation</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={settings.auto_approve || false}
              onChange={(e) => updateSetting('auto_approve', e.target.checked)}
            />
            Auto-approve new videos for upload
          </label>
        </section>

        {/* Channel Section */}
        <section className="settings-section" style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ marginBottom: '16px' }}>YouTube Channel</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 500 }}>{settings.channelName || 'Authenticated'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Connected to YouTube</div>
            </div>
            <button className="btn-secondary" onClick={() => window.api.startOAuth()}>Re-Authenticate</button>
          </div>
        </section>

      </div>
    </div>
  );
}
