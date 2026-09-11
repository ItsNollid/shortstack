import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Setup({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  
  const navigate = useNavigate();

  const handleAuth = async () => {
    try {
      const res = await window.api.startOAuth();
      if (res.success) {
        if (res.channelName) setChannelName(res.channelName);
        setStep(4);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Authentication failed: ${e.message || e}`);
    }
  };

  const handleSelectFolder = async () => {
    const res = await window.api.selectFolder();
    if (res) {
      setFolder(res);
      await window.api.setSetting('shorts_folder', res);
    }
  };

  const handleFinish = async () => {
    await window.api.setSetting('setup_complete', true);
    onComplete();
    navigate('/');
  };

  return (
    <div className="setup-container">
      <div className="setup-card animate-slide-up">
        <div className="setup-step-indicator">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className={`setup-dot ${i <= step ? 'active' : ''}`} />
          ))}
        </div>

        {step === 1 && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '32px', marginBottom: '16px', color: 'var(--accent-primary)' }}>📚 ShortStack</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '16px' }}>
              Welcome to your automated YouTube Shorts uploader. Let's get you set up.
            </p>
            <button className="btn-primary" style={{ padding: '12px 32px', fontSize: '16px' }} onClick={() => setStep(2)}>
              Get Started
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ marginBottom: '16px' }}>Step 1: Google Cloud Setup</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              To upload videos, you need to create your own Google Cloud app.
            </p>
            <ol style={{ marginLeft: '24px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-primary)' }}>
              <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">console.cloud.google.com</a></li>
              <li>Create a new project</li>
              <li>Enable "YouTube Data API v3" and "YouTube Analytics API"</li>
              <li>Go to Credentials {'>'} Create Credentials {'>'} OAuth client ID</li>
              <li>Choose "Desktop app" application type</li>
              <li>Download the JSON file and rename it to <strong>client_secret.json</strong></li>
              <li>Place it in the application's credentials folder.</li>
            </ol>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn-ghost" onClick={() => setStep(1)}>Back</button>
              <button className="btn-primary" onClick={() => setStep(3)}>I've done this</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ marginBottom: '16px' }}>Step 2: Connect YouTube</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
              Sign in with the Google Account linked to your YouTube channel.
            </p>
            
            <button className="btn-primary" style={{ padding: '16px 32px', fontSize: '18px', marginBottom: '32px' }} onClick={handleAuth}>
              Sign in with Google
            </button>
            
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn-ghost" onClick={() => setStep(2)}>Back</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 style={{ marginBottom: '16px' }}>Step 3: Select Video Folder</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Choose the folder where you will save your new shorts. ShortStack will automatically detect new videos placed here.
            </p>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
              <input type="text" readOnly value={folder || ''} placeholder="No folder selected..." style={{ flex: 1 }} />
              <button className="btn-secondary" onClick={handleSelectFolder}>Browse...</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn-ghost" onClick={() => setStep(3)}>Back</button>
              <button className="btn-primary" onClick={() => setStep(5)} disabled={!folder}>Next</button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ marginBottom: '16px' }}>All Set! 🎉</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
              Your environment is configured. You can customize default descriptions, tags, and scheduling rules in the Settings menu later.
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn-ghost" onClick={() => setStep(4)}>Back</button>
              <button className="btn-primary" onClick={handleFinish}>Finish Setup</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
