import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  const [scheduleStatus, setScheduleStatus] = useState({ paused: false, nextUpload: null });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        if (window.api && window.api.getScheduleStatus) {
          const status = await window.api.getScheduleStatus();
          setScheduleStatus(status);
        }
      } catch (err) {
        console.error('Failed to get schedule status', err);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const toggleSchedule = async () => {
    if (scheduleStatus.paused) {
      await window.api.resumeSchedule();
    } else {
      await window.api.pauseSchedule();
    }
    const status = await window.api.getScheduleStatus();
    setScheduleStatus(status);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        📚 ShortStack
      </div>
      
      <nav className="sidebar-nav">
        <NavLink to="/" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'sidebar-active' : ''}`}>
          📋 Queue
        </NavLink>
        <NavLink to="/calendar" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'sidebar-active' : ''}`}>
          📅 Calendar
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'sidebar-active' : ''}`}>
          📜 History
        </NavLink>
        <NavLink to="/analytics" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'sidebar-active' : ''}`}>
          📊 Analytics
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'sidebar-active' : ''}`}>
          ⚙️ Settings
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="schedule-status">
          <div className={`status-dot ${scheduleStatus.paused ? 'paused' : 'active'}`}></div>
          <span>{scheduleStatus.paused ? 'Schedule Paused' : 'Schedule Active'}</span>
        </div>
        <button 
          className={scheduleStatus.paused ? 'btn-primary' : 'btn-secondary'} 
          onClick={toggleSchedule}
        >
          {scheduleStatus.paused ? 'Resume Uploads' : 'Pause Uploads'}
        </button>
      </div>
    </aside>
  );
}
