import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Save, Trash2, FilePen, AlertCircle, ShieldCheck, Lock,
    Bot, Send, Loader2, PanelRightOpen, PanelRightClose,
    MoreHorizontal, Database, X, Check
} from 'lucide-react';
import { api } from './api';

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
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

// ─── Unsaved Changes Dialog ───────────────────────────────────────────────────
function UnsavedDialog({ entryName, onSave, onDiscard, onCancel }) {
    return (
        <div className="dialog-overlay">
            <div className="dialog-card">
                <h3>Unsaved Changes</h3>
                <p>
                    <strong>"{entryName}"</strong> has unsaved changes. Save before leaving?
                </p>
                <div className="dialog-actions">
                    <button className="btn-neutral" onClick={onCancel}>Stay</button>
                    <button className="btn-neutral" onClick={onDiscard}>Discard</button>
                    <button className="btn-save" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={onSave}>
                        <Save size={13} /> Save & Encrypt
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Memory Save Modal ────────────────────────────────────────────────────────
function MemoryModal({ content, journalName, password, onClose }) {
    const [title, setTitle] = useState('');
    const [scope, setScope] = useState(journalName ? 'journal' : 'global');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const inputRef = useRef(null);

    // Auto-generate title
    useEffect(() => {
        const words = content.trim().split(/\s+/).slice(0, 5);
        const auto = words.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean).join('_');
        setTitle(auto.slice(0, 50));
    }, [content]);

    // Focus on open
    useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

    // Esc to close
    useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    async function handleSave() {
        if (!title.trim() || saving || saved) return;
        setSaving(true);
        try {
            const journal_name = scope === 'journal' ? journalName : null;
            const res = await fetch('/api/memories/save-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-password': password },
                body: JSON.stringify({ content, title: title.trim(), journal_name }),
            });
            if (!res.ok) throw new Error('Failed');
            setSaved(true);
            setTimeout(onClose, 1000);
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            className="dialog-overlay"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="dialog-card" style={{ maxWidth: 440, width: '90vw' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Database size={16} color="var(--accent-primary)" />
                        <h3 style={{ margin: 0, fontSize: 15 }}>Save to Memory</h3>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: 4, borderRadius: 4,
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Content preview */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                    marginBottom: 16,
                    maxHeight: 110,
                    overflowY: 'auto',
                }}>
                    {content}
                </div>

                {/* Title */}
                <div style={{ marginBottom: 14 }}>
                    <label style={{
                        fontSize: 11, color: 'var(--text-muted)', display: 'block',
                        marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        Memory Title
                    </label>
                    <input
                        ref={inputRef}
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 7, padding: '8px 11px',
                            fontSize: 13, color: 'var(--text-primary)',
                            outline: 'none', fontFamily: 'monospace',
                        }}
                        placeholder="snake_case_title"
                        spellCheck={false}
                    />
                </div>

                {/* Scope — only shown inside a journal */}
                {journalName && (
                    <div style={{ marginBottom: 18 }}>
                        <label style={{
                            fontSize: 11, color: 'var(--text-muted)', display: 'block',
                            marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>
                            Scope
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {[
                                { value: 'journal', label: `📓 This entry` },
                                { value: 'global', label: '🌐 Global' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setScope(opt.value)}
                                    style={{
                                        flex: 1, padding: '7px 10px', borderRadius: 7,
                                        border: '1px solid',
                                        borderColor: scope === opt.value ? 'var(--accent-primary)' : 'var(--border-subtle)',
                                        background: scope === opt.value
                                            ? 'color-mix(in srgb, var(--accent-primary) 15%, transparent)'
                                            : 'transparent',
                                        color: scope === opt.value ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                        fontSize: 13, cursor: 'pointer',
                                        fontWeight: scope === opt.value ? 600 : 400,
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="dialog-actions" style={{ marginTop: 0 }}>
                    <button className="btn-neutral" onClick={onClose}>Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={saving || saved || !title.trim()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '8px 18px', borderRadius: 8, border: 'none',
                            background: saved ? 'var(--accent-success, #22c55e)' : 'var(--accent-primary)',
                            color: '#fff', fontSize: 13, fontWeight: 600,
                            cursor: saving || saved || !title.trim() ? 'default' : 'pointer',
                            opacity: !title.trim() && !saved ? 0.5 : 1,
                            transition: 'background 0.2s',
                        }}
                    >
                        {saved ? <><Check size={13} />  Saved!</>
                            : saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                                : <><Database size={13} /> Save to Memory</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Chat Message ─────────────────────────────────────────────────────────────
function ChatMessage({ msg, journalName, password }) {
    const [showMenu, setShowMenu] = useState(false);
    const [showMemoryModal, setShowMemoryModal] = useState(false);
    const menuRef = useRef(null);
    const isAssistant = msg.role === 'assistant';

    useEffect(() => {
        if (!showMenu) return;
        const h = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [showMenu]);

    return (
        <>
            {showMemoryModal && (
                <MemoryModal
                    content={msg.content}
                    journalName={journalName}
                    password={password}
                    onClose={() => setShowMemoryModal(false)}
                />
            )}

            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isAssistant ? 'flex-start' : 'flex-end',
                marginBottom: 14,
                gap: 3,
            }}>
                <span style={{
                    fontSize: 10, color: 'var(--text-muted)',
                    paddingLeft: isAssistant ? 4 : 0,
                    paddingRight: isAssistant ? 0 : 4,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                    {isAssistant ? 'Aether' : 'You'}
                </span>

                <div style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 5,
                    maxWidth: '90%',
                    flexDirection: isAssistant ? 'row' : 'row-reverse',
                }}>
                    {/* Bubble */}
                    <div style={{
                        background: isAssistant ? 'var(--bg-card)' : 'var(--accent-primary)',
                        color: isAssistant ? 'var(--text-primary)' : '#fff',
                        borderRadius: isAssistant ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                        padding: '9px 13px',
                        fontSize: 13,
                        lineHeight: 1.65,
                        border: isAssistant ? '1px solid var(--border-subtle)' : 'none',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                    }}>
                        {msg.content || (
                            <span style={{ opacity: 0.4, fontStyle: 'italic' }}>Thinking…</span>
                        )}
                    </div>

                    {/* Options button — sits beside the bubble, shown on hover */}
                    <div ref={menuRef} style={{ position: 'relative', flexShrink: 0, marginBottom: 2 }}>
                        <button
                            onClick={() => setShowMenu(v => !v)}
                            className="msg-options-btn"
                            title="Message options"
                            style={{
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '50%',
                                width: 24, height: 24,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: 'var(--text-muted)',
                                opacity: 0, transition: 'opacity 0.15s',
                                flexShrink: 0,
                            }}
                        >
                            <MoreHorizontal size={12} />
                        </button>

                        {showMenu && (
                            <div style={{
                                position: 'absolute',
                                bottom: 30,
                                [isAssistant ? 'left' : 'right']: 0,
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 9,
                                overflow: 'hidden',
                                zIndex: 50,
                                minWidth: 170,
                                boxShadow: '0 6px 24px rgba(0,0,0,0.2)',
                            }}>
                                <button
                                    onClick={() => { setShowMemoryModal(true); setShowMenu(false); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 9,
                                        width: '100%', padding: '10px 14px',
                                        background: 'none', border: 'none',
                                        color: 'var(--text-primary)', fontSize: 13,
                                        cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    <Database size={13} color="var(--accent-primary)" />
                                    Save to Memory
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Agent Pane (right side) ──────────────────────────────────────────────────
function AgentPane({ name, password, getContent, models }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [selectedModel, setSelectedModel] = useState('');
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (models.length && !selectedModel) setSelectedModel(models[0]);
    }, [models]);

    useEffect(() => {
        if (scrollRef.current)
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    async function sendMessage() {
        const text = input.trim();
        if (!text || streaming || !selectedModel) return;

        const userMsg = { role: 'user', content: text };
        const newMessages = [...messages, userMsg];
        setMessages([...newMessages, { role: 'assistant', content: '' }]);
        setInput('');
        setStreaming(true);
        if (inputRef.current) inputRef.current.style.height = 'auto';

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-password': password },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: newMessages,
                    journal_context: getContent(),
                    journal_name: name,
                }),
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.token) {
                            setMessages(prev => {
                                const u = [...prev];
                                u[u.length - 1] = { ...u[u.length - 1], content: u[u.length - 1].content + data.token };
                                return u;
                            });
                        }
                    } catch { }
                }
            }
        } catch (e) {
            setMessages(prev => {
                const u = [...prev];
                u[u.length - 1] = { ...u[u.length - 1], content: `Error: ${e.message}` };
                return u;
            });
        } finally {
            setStreaming(false);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }

    return (
        <div style={{
            width: 340,
            minWidth: 280,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-secondary)',
            borderLeft: '1px solid var(--border-subtle)',
            height: '100%',
            overflow: 'hidden',
            flexShrink: 0,
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-card)', flexShrink: 0,
            }}>
                <Bot size={15} color="var(--accent-primary)" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                    Journal Agent
                </span>
                <span style={{
                    fontSize: 11, color: 'var(--text-muted)',
                    background: 'var(--bg-secondary)',
                    padding: '2px 8px', borderRadius: 20,
                    border: '1px solid var(--border-subtle)',
                    maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {name}
                </span>
            </div>

            {/* Model selector */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    style={{
                        width: '100%',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 7, padding: '6px 9px',
                        fontSize: 12, color: 'var(--text-primary)',
                        cursor: 'pointer', outline: 'none',
                    }}
                >
                    {models.length === 0
                        ? <option value="">No models available</option>
                        : models.map(m => <option key={m} value={m}>{m}</option>)
                    }
                </select>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                className="agent-messages"
                style={{
                    flex: 1, overflowY: 'auto',
                    padding: '14px 10px 10px',
                    display: 'flex', flexDirection: 'column',
                }}
            >
                {messages.length === 0 ? (
                    <div style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)', gap: 12,
                        textAlign: 'center', padding: '0 24px',
                    }}>
                        <Bot size={30} strokeWidth={1.2} />
                        <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                            Ask anything about this journal entry. I can see its full content and associated memories.
                        </p>
                    </div>
                ) : (
                    <>
                        {messages.map((msg, i) => (
                            <div key={i} className="msg-wrapper">
                                <ChatMessage msg={msg} journalName={name} password={password} />
                            </div>
                        ))}
                        {streaming && messages[messages.length - 1]?.content === '' && (
                            <div style={{ display: 'flex', gap: 5, padding: '6px 10px' }}>
                                {[0, 1, 2].map(i => (
                                    <div key={i} style={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        background: 'var(--text-muted)',
                                        animation: `dotBounce 1s ease-in-out ${i * 0.16}s infinite`,
                                    }} />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Input */}
            <div style={{
                padding: '10px 10px 12px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)', flexShrink: 0,
            }}>
                <div style={{
                    display: 'flex', gap: 7,
                    background: 'var(--bg-secondary)',
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    padding: '7px 8px',
                    alignItems: 'flex-end',
                }}>
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                        placeholder="Ask about this entry…"
                        rows={1}
                        style={{
                            flex: 1, background: 'none', border: 'none',
                            outline: 'none', resize: 'none',
                            fontSize: 13, color: 'var(--text-primary)',
                            lineHeight: 1.5, maxHeight: 110,
                            overflow: 'auto', fontFamily: 'inherit',
                        }}
                        onInput={e => {
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px';
                        }}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={streaming || !input.trim() || !selectedModel}
                        style={{
                            background: 'var(--accent-primary)', border: 'none',
                            borderRadius: 7, width: 32, height: 32,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: streaming || !input.trim() ? 'default' : 'pointer',
                            opacity: streaming || !input.trim() ? 0.4 : 1,
                            flexShrink: 0, transition: 'opacity 0.15s',
                        }}
                    >
                        {streaming
                            ? <Loader2 size={14} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                            : <Send size={14} color="#fff" />
                        }
                    </button>
                </div>
                <p style={{ margin: '5px 4px 0', fontSize: 10, color: 'var(--text-muted)' }}>
                    Shift+Enter for new line · hover messages to save
                </p>
            </div>
        </div>
    );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────
export default function Editor({ name, password, onSaved, onDeleted, onNavigateAway }) {
    const [content, setContent] = useState('');
    const [savedContent, setSavedContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saveStatus, setSaveStatus] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);
    const [showUnsaved, setShowUnsaved] = useState(false);
    const [pendingNav, setPendingNav] = useState(null);
    const [agentOpen, setAgentOpen] = useState(false);
    const [models, setModels] = useState([]);
    const textareaRef = useRef(null);

    const isDirty = content !== savedContent;

    // ── Load entry ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!name) return;
        setLoading(true);
        setError('');
        setContent('');
        setSavedContent('');
        setSaveStatus('');

        api.readFile(password, name)
            .then(data => {
                const c = data.content || '';
                setContent(c);
                setSavedContent(c);
                setTimeout(() => textareaRef.current?.focus(), 100);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [name, password]);

    // ── Fetch models ────────────────────────────────────────────────────────
    useEffect(() => {
        fetch('/api/models')
            .then(r => r.json())
            .then(d => setModels(d.models || []))
            .catch(() => { });
    }, []);

    // ── Navigation guard ────────────────────────────────────────────────────
    // Parent passes onNavigateAway(guardFn) — we hook in to show modal if dirty.
    // guardFn receives proceed() which the parent calls to complete navigation.
    useEffect(() => {
        if (!onNavigateAway) return;
        onNavigateAway((proceed) => {
            if (!isDirty) { proceed(); return; }
            setPendingNav(() => proceed);
            setShowUnsaved(true);
        });
    }, [isDirty, onNavigateAway]);

    // ── Save ────────────────────────────────────────────────────────────────
    async function performSave() {
        if (saving || loading) return;
        setSaving(true);
        setError('');
        try {
            await api.saveFile(password, name, content);
            setSavedContent(content);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus(''), 3000);
            onSaved && onSaved();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    // ── Delete ──────────────────────────────────────────────────────────────
    async function handleDelete() {
        try {
            await api.deleteFile(password, name);
            onDeleted && onDeleted(name);
        } catch (err) {
            setError(err.message);
        }
        setShowConfirm(false);
    }

    // ── Unsaved modal handlers ──────────────────────────────────────────────
    async function handleUnsavedSave() {
        await performSave();
        setShowUnsaved(false);
        if (pendingNav) { pendingNav(); setPendingNav(null); }
    }
    function handleUnsavedDiscard() {
        setShowUnsaved(false);
        if (pendingNav) { pendingNav(); setPendingNav(null); }
    }
    function handleUnsavedCancel() {
        setShowUnsaved(false);
        setPendingNav(null);
    }

    // ── Ctrl/Cmd+S ──────────────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                performSave();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [content, name, password, saving, loading]);

    const getContent = useCallback(() => content, [content]);

    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const charCount = content.length;

    return (
        <div className="main-content" style={{ display: 'flex', flexDirection: 'row', height: '100%', overflow: 'hidden' }}>

            {/* ── Dialogs ── */}
            {showConfirm && (
                <ConfirmDialog
                    message={`Permanently delete "${name}"? This cannot be undone.`}
                    onConfirm={handleDelete}
                    onCancel={() => setShowConfirm(false)}
                />
            )}
            {showUnsaved && (
                <UnsavedDialog
                    entryName={name}
                    onSave={handleUnsavedSave}
                    onDiscard={handleUnsavedDiscard}
                    onCancel={handleUnsavedCancel}
                />
            )}

            {/* ── Editor column ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

                {/* Toolbar */}
                <header className="editor-toolbar">
                    <div className="toolbar-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FilePen size={18} color="var(--text-muted)" />
                        <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>

                        {isDirty && !saving && (
                            <span style={{
                                fontSize: 11,
                                color: 'var(--accent-warning, #f59e0b)',
                                background: 'color-mix(in srgb, var(--accent-warning, #f59e0b) 12%, transparent)',
                                padding: '2px 8px', borderRadius: 20,
                                border: '1px solid color-mix(in srgb, var(--accent-warning, #f59e0b) 30%, transparent)',
                            }}>
                                unsaved
                            </span>
                        )}
                        {saving && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> saving…
                            </span>
                        )}
                    </div>

                    <div className="toolbar-actions">
                        {error && (
                            <span style={{ color: 'var(--accent-danger)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertCircle size={14} /> {error}
                            </span>
                        )}
                        {saveStatus === 'saved' && (
                            <span className="save-status saved">
                                <ShieldCheck size={14} /> Encrypted
                            </span>
                        )}

                        {/* Agent toggle */}
                        <button
                            onClick={() => setAgentOpen(v => !v)}
                            title={agentOpen ? 'Close agent' : 'Open journal agent'}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '5px 10px', borderRadius: 7, border: '1px solid',
                                borderColor: agentOpen ? 'var(--accent-primary)' : 'var(--border-subtle)',
                                background: agentOpen
                                    ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)'
                                    : 'transparent',
                                color: agentOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
                                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                                transition: 'all 0.15s',
                            }}
                        >
                            {agentOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                            <span>Agent</span>
                        </button>

                        <button className="btn-delete" onClick={() => setShowConfirm(true)}>
                            <Trash2 size={14} /> Delete
                        </button>
                        <button className="btn-save" onClick={performSave} disabled={saving || loading}>
                            {saving
                                ? <div className="spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} />
                                : <Save size={14} />
                            }
                            <span>{saving ? 'Encrypting...' : 'Save & Encrypt'}</span>
                        </button>
                    </div>
                </header>

                {/* Writing area */}
                <main className="editor-area" style={{ display: 'flex', flexDirection: 'column', padding: 0, flex: 1, overflow: 'hidden' }}>
                    {loading ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="spinner" style={{ width: 40, height: 40, borderTopColor: 'var(--accent-primary)' }} />
                            <p style={{ marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>Decrypting Secure Vault...</p>
                        </div>
                    ) : (
                        <div className="editor-inner" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <textarea
                                ref={textareaRef}
                                className="journal-textarea"
                                style={{
                                    flex: 1,
                                    padding: '32px 28px',
                                    fontSize: '18px',
                                    border: 'none',
                                    outline: 'none',
                                    background: 'transparent',
                                    resize: 'none',
                                    overflowY: 'auto',
                                }}
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                placeholder="Start writing your secure thoughts..."
                                spellCheck={true}
                            />
                            <footer style={{
                                padding: '12px 24px',
                                borderTop: '1px solid var(--border-subtle)',
                                background: 'var(--bg-secondary)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                flexShrink: 0,
                            }}>
                                <div className="word-count" style={{ margin: 0 }}>
                                    <strong>{wordCount}</strong> words · <strong>{charCount}</strong> characters
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Lock size={12} /> AES-256 Bit Encryption Active
                                </div>
                            </footer>
                        </div>
                    )}
                </main>
            </div>

            {/* ── Agent Pane (RIGHT) ── */}
            {agentOpen && !loading && (
                <AgentPane
                    name={name}
                    password={password}
                    getContent={getContent}
                    models={models}
                />
            )}

            {/* Scoped styles */}
            <style>{`
                .msg-wrapper:hover .msg-options-btn { opacity: 1 !important; }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes dotBounce {
                    0%, 100% { transform: translateY(0); opacity: 0.5; }
                    50%       { transform: translateY(-5px); opacity: 1; }
                }

                .agent-messages::-webkit-scrollbar { width: 4px; }
                .agent-messages::-webkit-scrollbar-track { background: transparent; }
                .agent-messages::-webkit-scrollbar-thumb {
                    background: var(--border-subtle);
                    border-radius: 4px;
                }
            `}</style>
        </div>
    );
}