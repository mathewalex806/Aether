import { useState, useEffect } from 'react';
import { Plus, Search, BookOpen, Lock, Clock, CheckCheck, X } from 'lucide-react';

function formatDate(name) {
    // Names expected like "2026-02-28" or arbitrary
    const parts = name.split('_');
    if (parts.length === 0) return name;
    return name.replace(/_/g, ' ');
}

export default function Sidebar({ files, selected, onSelect, onNew, onLock, loading }) {
    const [search, setSearch] = useState('');
    const [showNewForm, setShowNewForm] = useState(false);
    const [newName, setNewName] = useState('');

    const filtered = files.filter((f) =>
        f.toLowerCase().includes(search.toLowerCase())
    );

    function handleNew() {
        // Suggest today's date as default name
        const today = new Date().toISOString().slice(0, 10);
        setNewName(today);
        setShowNewForm(true);
    }

    function confirmNew() {
        const trimmed = newName.trim();
        if (!trimmed) return;
        onNew(trimmed);
        setShowNewForm(false);
        setNewName('');
    }

    function cancelNew() {
        setShowNewForm(false);
        setNewName('');
    }

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-brand">
                    <div className="sidebar-brand-icon">
                        <BookOpen size={16} color="white" />
                    </div>
                    <span className="sidebar-brand-name">Journal</span>
                </div>
                <div className="sidebar-actions">
                    <button className="icon-btn" onClick={handleNew} title="New entry">
                        <Plus size={18} />
                    </button>
                </div>
            </div>

            <div className="sidebar-search">
                <div className="search-input-wrapper">
                    <Search size={14} />
                    <input
                        className="search-input"
                        placeholder="Search entries..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {showNewForm && (
                <div className="new-entry-form">
                    <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') confirmNew(); if (e.key === 'Escape') cancelNew(); }}
                        placeholder="Entry name..."
                    />
                    <div className="new-entry-actions">
                        <button className="btn-xs confirm" onClick={confirmNew}>
                            <CheckCheck size={13} style={{ display: 'inline', marginRight: 4 }} />
                            Create
                        </button>
                        <button className="btn-xs cancel" onClick={cancelNew}>
                            <X size={13} style={{ display: 'inline', marginRight: 4 }} />
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="sidebar-empty">
                    <div className="sidebar-empty-inner">
                        <div className="spinner" style={{ margin: '0 auto', borderTopColor: 'var(--accent-primary)' }} />
                    </div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="sidebar-empty">
                    <div className="sidebar-empty-inner">
                        <BookOpen size={36} />
                        <p>{search ? 'No entries match your search.' : 'No entries yet.\nClick + to create one.'}</p>
                    </div>
                </div>
            ) : (
                <div className="sidebar-list">
                    {filtered.map((name) => (
                        <div
                            key={name}
                            className={`sidebar-entry ${selected === name ? 'active' : ''}`}
                            onClick={() => onSelect(name)}
                        >
                            <div className="entry-title">{formatDate(name)}</div>
                            <div className="entry-meta">
                                <Clock size={10} />
                                <span>{name}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="sidebar-footer">
                <button className="lock-btn" onClick={onLock}>
                    <Lock size={14} />
                    Lock vault
                </button>
            </div>
        </div>
    );
}
