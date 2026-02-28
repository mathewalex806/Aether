import { useState, useCallback, useEffect, useRef } from 'react';
import { Save, Trash2, FilePen, AlertCircle } from 'lucide-react';
import { api } from './api';

function ConfirmDialog({ message, onConfirm, onCancel }) {
    return (
        <div className="dialog-overlay">
            <div className="dialog-card">
                <h3>Confirm Delete</h3>
                <p>{message}</p>
                <div className="dialog-actions">
                    <button className="btn-neutral" onClick={onCancel}>Cancel</button>
                    <button className="btn-danger" onClick={onConfirm}>Delete</button>
                </div>
            </div>
        </div>
    );
}

export default function Editor({ name, password, onSaved, onDeleted }) {
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saveStatus, setSaveStatus] = useState(''); // 'saved' | ''
    const [showConfirm, setShowConfirm] = useState(false);
    const textareaRef = useRef(null);

    useEffect(() => {
        if (!name) return;
        setLoading(true);
        setError('');
        setContent('');
        setSaveStatus('');

        api.readFile(password, name)
            .then((data) => setContent(data.content || ''))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [name, password]);

    async function handleSave() {
        setSaving(true);
        setError('');
        try {
            await api.saveFile(password, name, content);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus(''), 3000);
            onSaved && onSaved();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        try {
            await api.deleteFile(password, name);
            onDeleted && onDeleted(name);
        } catch (err) {
            setError(err.message);
        }
        setShowConfirm(false);
    }

    // Keyboard shortcut: Ctrl+S to save
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [content, name, password]);

    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const charCount = content.length;

    return (
        <>
            {showConfirm && (
                <ConfirmDialog
                    message={`Are you sure you want to permanently delete "${name}"? This cannot be undone.`}
                    onConfirm={handleDelete}
                    onCancel={() => setShowConfirm(false)}
                />
            )}

            <div className="editor-toolbar">
                <div className="toolbar-title">
                    <FilePen size={18} color="var(--text-muted)" />
                    <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
                </div>

                <div className="toolbar-actions">
                    {error && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#fca5a5' }}>
                            <AlertCircle size={14} />{error}
                        </span>
                    )}
                    {saveStatus === 'saved' && (
                        <span className="save-status saved">
                            <Save size={12} /> Saved securely
                        </span>
                    )}
                    <button className="btn-delete" onClick={() => setShowConfirm(true)}>
                        <Trash2 size={14} />
                        Delete
                    </button>
                    <button className="btn-save" onClick={handleSave} disabled={saving || loading}>
                        {saving ? <div className="spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} /> : <Save size={14} />}
                        {saving ? 'Encrypting...' : 'Save & Encrypt'}
                    </button>
                </div>
            </div>

            <div className="editor-area">
                <div className="editor-inner">
                    {loading ? (
                        <div style={{ textAlign: 'center', paddingTop: 40 }}>
                            <div className="spinner" style={{ margin: '0 auto', borderTopColor: 'var(--accent-primary)' }} />
                            <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>Decrypting entry...</p>
                        </div>
                    ) : (
                        <>
                            <div className="word-count">
                                {wordCount} words · {charCount} characters · AES-256 encrypted
                            </div>
                            <textarea
                                ref={textareaRef}
                                className="journal-textarea"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Start writing your thoughts... (Ctrl+S to save and encrypt)"
                                autoFocus
                            />
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
