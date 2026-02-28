import { useState, useEffect, useCallback } from 'react';
import { Brain, Trash2, RefreshCw, StickyNote } from 'lucide-react';

const BASE_URL = '/api';
function headers(p) { return { 'Content-Type': 'application/json', 'x-password': p }; }

export default function MemoryViewer({ password }) {
    const [memories, setMemories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState({});

    const load = useCallback(async () => {
        if (!password) return;
        setLoading(true);
        setError(null);
        try {
            const r = await fetch(`${BASE_URL}/memories`, { headers: headers(password) });
            if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
            const d = await r.json();
            setMemories(d.memories || []);
        } catch (e) {
            console.error('[MemoryViewer] load failed:', e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [password]);

    // Reload whenever password changes (covers initial mount once password is set)
    useEffect(() => { load(); }, [load]);

    // Expose a reload trigger so parent components can call it after a memory is saved
    // Usage: <MemoryViewer password={pw} ref={ref} /> then ref.current.reload()
    // (kept simple here — parent can also just remount or pass a `refreshKey` prop)

    async function confirmSave(title, content) {
        /**
         * Called by a parent/chat component when the user confirms a SUGGEST_MEMORY.
         * Posts to the REST endpoint so the memory is persisted on disk + ChromaDB.
         */
        try {
            const r = await fetch(`${BASE_URL}/memories`, {
                method: 'POST',
                headers: headers(password),
                body: JSON.stringify({ title, content }),
            });
            if (!r.ok) throw new Error(`Save failed: ${r.status}`);
            // Optimistically add to local state
            setMemories(prev => {
                const exists = prev.find(m => m.title === title);
                if (exists) return prev.map(m => m.title === title ? { ...m, content } : m);
                return [...prev, { title, content }];
            });
        } catch (e) {
            console.error('[MemoryViewer] confirmSave failed:', e);
        }
    }

    async function deleteMemory(title) {
        try {
            const r = await fetch(`${BASE_URL}/memories/${encodeURIComponent(title)}`, {
                method: 'DELETE',
                headers: headers(password),
            });
            if (!r.ok) throw new Error(`Delete failed: ${r.status}`);
            setMemories(m => m.filter(x => x.title !== title));
        } catch (e) {
            console.error('[MemoryViewer] delete failed:', e);
        }
    }

    function toggle(title) {
        setExpanded(prev => ({ ...prev, [title]: !prev[title] }));
    }

    return (
        <div className="memory-layout">
            <div className="memory-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Brain size={16} color="var(--accent-primary)" />
                    <span className="memory-toolbar-title">Agent Memories</span>
                    <span className="memory-count">{memories.length} stored</span>
                </div>
                <button className="icon-btn" onClick={load} title="Refresh" disabled={loading}>
                    <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                </button>
            </div>

            <div className="memory-content">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 60 }}>
                        <div className="spinner" style={{ margin: '0 auto', borderTopColor: 'var(--accent-primary)' }} />
                    </div>
                ) : error ? (
                    <div className="memory-empty">
                        <Brain size={40} style={{ opacity: 0.3, marginBottom: 16 }} />
                        <h3>Failed to load memories</h3>
                        <p style={{ color: 'var(--error, #e55)', fontSize: 13 }}>{error}</p>
                        <button className="icon-btn" onClick={load} style={{ marginTop: 12 }}>
                            Retry
                        </button>
                    </div>
                ) : memories.length === 0 ? (
                    <div className="memory-empty">
                        <Brain size={40} style={{ opacity: 0.3, marginBottom: 16 }} />
                        <h3>No memories yet</h3>
                        <p>Chat with the AI agent and it will automatically save important facts about you here.</p>
                    </div>
                ) : (
                    <div className="memory-grid">
                        {memories.map(mem => (
                            <div key={mem.title} className="memory-card">
                                <div className="memory-card-header" onClick={() => toggle(mem.title)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <StickyNote size={13} color="var(--accent-primary)" />
                                        <span className="memory-card-title">{mem.title.replace(/_/g, ' ')}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <button
                                            className="icon-btn danger"
                                            onClick={(e) => { e.stopPropagation(); deleteMemory(mem.title); }}
                                            title="Delete memory"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                        <span
                                            className="expand-chevron"
                                            style={{
                                                transform: expanded[mem.title] ? 'rotate(180deg)' : 'none',
                                                transition: 'transform 0.2s',
                                                opacity: 0.5,
                                                fontSize: 12,
                                            }}
                                        >▾</span>
                                    </div>
                                </div>
                                {expanded[mem.title] && (
                                    <div className="memory-card-body">
                                        <pre className="memory-text">{mem.content}</pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}