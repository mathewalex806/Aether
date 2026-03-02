import { useState, useEffect, useCallback } from 'react';
import { Brain, Trash2, RefreshCw, StickyNote, BookOpen, Globe } from 'lucide-react';

const BASE_URL = '/api';
function headers(p) { return { 'Content-Type': 'application/json', 'x-password': p }; }

/**
 * MemoryViewer
 * Props:
 *   password      {string}       – auth header value
 *   activeJournal {string|null}  – currently open journal name (null = global / no journal)
 *
 * When activeJournal is set, the viewer shows only memories for that journal.
 * A "View all" toggle lets the user see every memory across all journals.
 */
export default function MemoryViewer({ password, activeJournal = null }) {
    const [memories, setMemories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState({});
    const [showAll, setShowAll] = useState(false);   // toggle: journal-only vs all

    // Derive the fetch scope: if showAll, fetch everything; otherwise scope to journal
    const fetchJournal = showAll ? null : activeJournal;

    const load = useCallback(async () => {
        if (!password) return;
        setLoading(true);
        setError(null);
        try {
            const url = fetchJournal
                ? `${BASE_URL}/memories?journal=${encodeURIComponent(fetchJournal)}`
                : `${BASE_URL}/memories`;
            const r = await fetch(url, { headers: headers(password) });
            if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
            const d = await r.json();
            setMemories(d.memories || []);
        } catch (e) {
            console.error('[MemoryViewer] load failed:', e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [password, fetchJournal]);

    useEffect(() => { load(); }, [load]);

    // Called by parent chat component when user confirms a SUGGEST_MEMORY
    async function confirmSave(title, content, journalName) {
        try {
            const r = await fetch(`${BASE_URL}/memories`, {
                method: 'POST',
                headers: headers(password),
                body: JSON.stringify({ title, content, journal_name: journalName ?? null }),
            });
            if (!r.ok) throw new Error(`Save failed: ${r.status}`);
            const key = memKey(title, journalName);
            setMemories(prev => {
                const exists = prev.find(m => memKey(m.title, m.journal_name) === key);
                if (exists) return prev.map(m => memKey(m.title, m.journal_name) === key ? { ...m, content } : m);
                return [...prev, { title, journal_name: journalName ?? null, content }];
            });
        } catch (e) {
            console.error('[MemoryViewer] confirmSave failed:', e);
        }
    }

    async function deleteMemory(title, journalName) {
        try {
            const url = journalName
                ? `${BASE_URL}/memories/${encodeURIComponent(title)}?journal=${encodeURIComponent(journalName)}`
                : `${BASE_URL}/memories/${encodeURIComponent(title)}`;
            const r = await fetch(url, { method: 'DELETE', headers: headers(password) });
            if (!r.ok) throw new Error(`Delete failed: ${r.status}`);
            setMemories(m => m.filter(x => !(x.title === title && x.journal_name === journalName)));
        } catch (e) {
            console.error('[MemoryViewer] delete failed:', e);
        }
    }

    function memKey(title, journalName) {
        return `${journalName ?? '__global__'}::${title}`;
    }

    function toggle(title, journalName) {
        const k = memKey(title, journalName);
        setExpanded(prev => ({ ...prev, [k]: !prev[k] }));
    }

    // Group memories by journal_name for the "all" view
    const grouped = memories.reduce((acc, mem) => {
        const key = mem.journal_name || '__global__';
        if (!acc[key]) acc[key] = [];
        acc[key].push(mem);
        return acc;
    }, {});

    const scopeLabel = activeJournal
        ? `"${activeJournal}"`
        : 'Global';

    return (
        <div className="memory-layout">
            {/* ── Toolbar ── */}
            <div className="memory-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Brain size={16} color="var(--accent-primary)" />
                    <span className="memory-toolbar-title">Memories</span>
                    <span className="memory-count">{memories.length} stored</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {activeJournal && (
                        <button
                            className={`scope-toggle-btn ${showAll ? 'active' : ''}`}
                            onClick={() => setShowAll(v => !v)}
                            title={showAll ? 'Show only this journal' : 'Show all journals'}
                            style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                background: showAll ? 'var(--accent-primary)' : 'transparent',
                                color: showAll ? '#fff' : 'var(--text-secondary)',
                                cursor: 'pointer',
                            }}
                        >
                            {showAll ? 'All journals' : scopeLabel}
                        </button>
                    )}
                    <button
                        className="icon-btn"
                        onClick={load}
                        title="Refresh"
                        disabled={loading}
                    >
                        <RefreshCw
                            size={15}
                            style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
                        />
                    </button>
                </div>
            </div>

            {/* ── Content ── */}
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
                        <button className="icon-btn" onClick={load} style={{ marginTop: 12 }}>Retry</button>
                    </div>
                ) : memories.length === 0 ? (
                    <div className="memory-empty">
                        <Brain size={40} style={{ opacity: 0.3, marginBottom: 16 }} />
                        <h3>No memories yet</h3>
                        <p>
                            {activeJournal && !showAll
                                ? `Chat while viewing "${activeJournal}" and memories will be saved here.`
                                : 'Chat with the AI agent and it will save important facts here.'}
                        </p>
                    </div>
                ) : showAll || !activeJournal ? (
                    /* ── Grouped view (all journals) ── */
                    <div className="memory-groups">
                        {Object.entries(grouped).map(([groupKey, mems]) => (
                            <div key={groupKey} className="memory-group">
                                <div className="memory-group-header">
                                    {groupKey === '__global__' ? (
                                        <><Globe size={12} style={{ marginRight: 5 }} />Global</>
                                    ) : (
                                        <><BookOpen size={12} style={{ marginRight: 5 }} />{groupKey}</>
                                    )}
                                    <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 11 }}>
                                        {mems.length} {mems.length === 1 ? 'memory' : 'memories'}
                                    </span>
                                </div>
                                <div className="memory-grid">
                                    {mems.map(mem => (
                                        <MemoryCard
                                            key={memKey(mem.title, mem.journal_name)}
                                            mem={mem}
                                            expanded={expanded[memKey(mem.title, mem.journal_name)]}
                                            onToggle={() => toggle(mem.title, mem.journal_name)}
                                            onDelete={() => deleteMemory(mem.title, mem.journal_name)}
                                            showJournalBadge={false}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* ── Single-journal flat view ── */
                    <div className="memory-grid">
                        {memories.map(mem => (
                            <MemoryCard
                                key={memKey(mem.title, mem.journal_name)}
                                mem={mem}
                                expanded={expanded[memKey(mem.title, mem.journal_name)]}
                                onToggle={() => toggle(mem.title, mem.journal_name)}
                                onDelete={() => deleteMemory(mem.title, mem.journal_name)}
                                showJournalBadge={false}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function MemoryCard({ mem, expanded, onToggle, onDelete, showJournalBadge }) {
    return (
        <div className="memory-card">
            <div className="memory-card-header" onClick={onToggle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <StickyNote size={13} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                        <span className="memory-card-title">
                            {mem.title.replace(/_/g, ' ')}
                        </span>
                        {showJournalBadge && (
                            <span style={{
                                display: 'block',
                                fontSize: 10,
                                opacity: 0.5,
                                marginTop: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {mem.journal_name ?? 'global'}
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button
                        className="icon-btn danger"
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        title="Delete memory"
                    >
                        <Trash2 size={13} />
                    </button>
                    <span
                        style={{
                            transform: expanded ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.2s',
                            opacity: 0.5,
                            fontSize: 12,
                        }}
                    >▾</span>
                </div>
            </div>
            {expanded && (
                <div className="memory-card-body">
                    <pre className="memory-text">{mem.content}</pre>
                </div>
            )}
        </div>
    );
}