import React, { useState, useEffect } from 'react';
import { QueueItem } from '../../shared/types';
import TagInput from './TagInput';

interface MetadataEditorProps {
  item: QueueItem;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: number, data: Partial<QueueItem>) => void;
}

export default function MetadataEditor({ item, isOpen, onClose, onSave }: MetadataEditorProps) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [tags, setTags] = useState<string[]>(JSON.parse(item.tags || '[]'));
  const [category, setCategory] = useState(item.category_id || '22');
  const [privacy, setPrivacy] = useState(item.privacy || 'private');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Update state if item changes
  useEffect(() => {
    setTitle(item.title);
    setDescription(item.description);
    setTags(JSON.parse(item.tags || '[]'));
    setCategory(item.category_id || '22');
    setPrivacy(item.privacy || 'private');
  }, [item]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(item.id, {
      title,
      description,
      tags: JSON.stringify(tags),
      category_id: category,
      privacy: privacy as any
    });
    onClose();
  };

  const handleAutoGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await window.api.generateMetadata(item.filename || item.title);
      if (result) {
        if (result.title) setTitle(result.title);
        if (result.description) setDescription(result.description);
        if (result.tags) setTags(result.tags);
      }
    } catch (error: any) {
      alert(`Failed to auto-generate metadata: ${error.message || 'Ollama is not running'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="modal-content animate-slide-up">
        <div className="modal-header">
          Edit Metadata - {item.filename || item.title}
        </div>
        <div className="modal-body">
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Title</label>
              <button 
                className="btn-ghost" 
                style={{ fontSize: '0.85em', padding: '4px 8px' }}
                onClick={handleAutoGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? '⏳ Generating...' : '✨ Auto-Generate with AI'}
              </button>
            </div>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              maxLength={100}
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={5000}
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Tags</label>
            <TagInput tags={tags} onChange={setTags} />
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Privacy</label>
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
            </div>
            
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="20">Gaming</option>
                <option value="22">People & Blogs</option>
                <option value="23">Comedy</option>
                <option value="24">Entertainment</option>
                <option value="26">Howto & Style</option>
                <option value="27">Education</option>
                <option value="28">Science & Technology</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}
