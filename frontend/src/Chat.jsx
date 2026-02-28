import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Cpu, BookOpen, Brain, ChevronDown, Zap, Loader } from 'lucide-react';

const BASE_URL = '/api';

function headers(password) {
    return { 'Content-Type': 'application/json', 'x-password': password };
}

function ToolBadge({ title }) {
    return (
        <span className="tool-badge">
            <Brain size={11} />
            Memory saved: <em>{title.replace(/_/g, ' ')}</em>
        </span>
    );
}

function MessageBubble({ msg }) {
    if (msg.role === 'tool') {
        return <div className="chat-tool-event"><ToolBadge title={msg.title} /></div>;
    }
    const isUser = msg.role === 'user';
    return (
        <div className={`chat-bubble-row ${isUser ? 'user' : 'agent'}`}>
            <div className="chat-avatar">{isUser ? <User size={14} /> : <Bot size={14} />}</div>
            <div className={`chat-bubble ${isUser ? 'user' : 'agent'}`}>
                {msg.content}
                {msg.streaming && <span className="cursor-blink">▋</span>}
            </div>
        </div>
    );
}

export default function Chat({ password, journalFiles, readFile }) {
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [journalContext, setJournalContext] = useState(false);
    const [journalContextFile, setJournalContextFile] = useState('all');
    const [modelsError, setModelsError] = useState('');
    const [suggestions, setSuggestions] = useState([]); // [{id, title, content}]
    const bottomRef = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        fetch(`${BASE_URL}/models`, { headers: headers(password) })
            .then(r => r.json())
            .then(d => {
                setModels(d.models || []);
                if (d.models?.length) setSelectedModel(d.models[0]);
                if (d.error) setModelsError('Ollama unreachable — is it running?');
            })
            .catch(() => setModelsError('Could not connect to Ollama service'));
    }, [password]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function buildJournalContext() {
        if (!journalContext) return null;
        try {
            if (journalContextFile === 'all') {
                const parts = await Promise.all(
                    journalFiles.map(async name => {
                        const r = await fetch(`${BASE_URL}/files/${encodeURIComponent(name)}`, { headers: headers(password) });
                        const d = await r.json();
                        return `## ${name}\n${d.content}`;
                    })
                );
                return parts.join('\n\n');
            } else {
                const r = await fetch(`${BASE_URL}/files/${encodeURIComponent(journalContextFile)}`, { headers: headers(password) });
                const d = await r.json();
                return `## ${journalContextFile}\n${d.content}`;
            }
        } catch {
            return null;
        }
    }

    async function sendMessage() {
        const text = input.trim();
        if (!text || loading || !selectedModel) return;

        const userMsg = { role: 'user', content: text };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);

        const ctx = await buildJournalContext();

        // Placeholder for streaming agent response
        const agentIdx = newMessages.length;
        setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

        try {
            const resp = await fetch(`${BASE_URL}/chat`, {
                method: 'POST',
                headers: headers(password),
                body: JSON.stringify({
                    model: selectedModel,
                    messages: newMessages.map(m => ({ role: m.role, content: m.content })),
                    journal_context: ctx,
                }),
            });

            if (!resp.ok) {
                throw new Error(`Backend error: ${resp.status}`);
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let agentText = '';
            const extraEvents = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const raw = decoder.decode(value, { stream: true });
                for (const line of raw.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    const payload = JSON.parse(line.slice(6));
                    if (payload.token) {
                        agentText += payload.token;
                        setMessages(prev => {
                            const copy = [...prev];
                            copy[agentIdx] = { role: 'assistant', content: agentText, streaming: true };
                            return copy;
                        });
                    } else if (payload.tool === 'save_memory') {
                        extraEvents.push({ role: 'tool', title: payload.title, content: payload.content });
                    } else if (payload.tool === 'suggest_memory') {
                        setSuggestions(prev => [
                            ...prev,
                            { id: Date.now() + Math.random(), title: payload.title, content: payload.content }
                        ]);
                    } else if (payload.done) {
                        break;
                    }
                }
            }

            // Finalise
            setMessages(prev => {
                const copy = [...prev];
                copy[agentIdx] = { role: 'assistant', content: agentText, streaming: false };
                return [...copy, ...extraEvents];
            });
        } catch (err) {
            setMessages(prev => {
                const copy = [...prev];
                copy[agentIdx] = { role: 'assistant', content: `⚠️ Error: ${err.message}`, streaming: false };
                return copy;
            });
        } finally {
            setLoading(false);
        }
    }

    async function saveSuggestedMemory(id, title, content) {
        try {
            const resp = await fetch(`${BASE_URL}/memories`, {
                method: 'POST',
                headers: headers(password),
                body: JSON.stringify({ title, content }),
            });
            if (resp.ok) {
                setSuggestions(prev => prev.filter(s => s.id !== id));
                setMessages(prev => [...prev, { role: 'tool', title, content }]);
            }
        } catch (err) {
            console.error('Failed to save suggestion:', err);
        }
    }

    function dismissSuggestion(id) {
        setSuggestions(prev => prev.filter(s => s.id !== id));
    }

    function handleKey(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    return (
        <div className="chat-layout">
            {/* Toolbar */}
            <div className="chat-toolbar">
                <div className="chat-toolbar-left">
                    <Cpu size={16} color="var(--accent-primary)" />
                    <span className="chat-toolbar-title">AI Journal Assistant</span>
                    {modelsError && <span className="chat-error-badge">{modelsError}</span>}
                </div>
                <div className="chat-toolbar-right">
                    {/* Journal context toggle */}
                    <div className="journal-ctx-group">
                        <button
                            className={`ctx-toggle ${journalContext ? 'active' : ''}`}
                            onClick={() => setJournalContext(v => !v)}
                            title="Include journal content in chat"
                        >
                            <BookOpen size={13} />
                            Journal Context
                        </button>
                        {journalContext && journalFiles.length > 0 && (
                            <div className="select-wrapper">
                                <select
                                    value={journalContextFile}
                                    onChange={e => setJournalContextFile(e.target.value)}
                                    className="ctx-file-select"
                                >
                                    <option value="all">All entries</option>
                                    {journalFiles.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                                <ChevronDown size={12} className="select-chevron" />
                            </div>
                        )}
                    </div>

                    {/* Model selector */}
                    {models.length > 0 ? (
                        <div className="select-wrapper">
                            <select
                                value={selectedModel}
                                onChange={e => setSelectedModel(e.target.value)}
                                className="model-select"
                            >
                                {models.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <ChevronDown size={12} className="select-chevron" />
                        </div>
                    ) : (
                        <span className="model-placeholder"><Loader size={12} /> Loading models…</span>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="chat-messages">
                {messages.length === 0 && (
                    <div className="chat-empty">
                        <div className="chat-empty-icon"><Bot size={32} /></div>
                        <h3>Your private AI companion</h3>
                        <p>Everything runs locally. Toggle <strong>Journal Context</strong> to let the agent read your entries, or just start chatting.</p>
                        <div className="chat-suggestions">
                            {["What should I reflect on today?", "Summarise my recent entries", "Help me set a weekly goal"].map(s => (
                                <button key={s} className="suggestion-chip" onClick={() => { setInput(s); textareaRef.current?.focus(); }}>
                                    <Zap size={11} />{s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                <div ref={bottomRef} />
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
                <div className="suggestions-container">
                    {suggestions.map(s => (
                        <div key={s.id} className="suggestion-card">
                            <div className="suggestion-header">
                                <Brain size={14} />
                                <span>Memory Suggestion: <strong>{s.title.replace(/_/g, ' ')}</strong></span>
                            </div>
                            <div className="suggestion-body">
                                {s.content}
                            </div>
                            <div className="suggestion-footer">
                                <button className="btn-ghost" onClick={() => dismissSuggestion(s.id)}>Dismiss</button>
                                <button className="btn-mini-save" onClick={() => saveSuggestedMemory(s.id, s.title, s.content)}>Save Memory</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="chat-input-area">
                <div className="chat-input-wrapper">
                    <textarea
                        ref={textareaRef}
                        className="chat-textarea"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder="Message Aether… (Enter to send, Shift+Enter for newline)"
                        rows={1}
                        disabled={loading}
                    />
                    <button
                        className={`send-btn ${loading ? 'loading' : ''}`}
                        onClick={sendMessage}
                        disabled={loading || !input.trim() || !selectedModel}
                    >
                        {loading ? <div className="spinner" style={{ width: 16, height: 16, borderTopColor: 'white' }} /> : <Send size={16} />}
                    </button>
                </div>
                {journalContext && (
                    <div className="ctx-indicator">
                        <BookOpen size={11} />
                        Journal context active — agent can read your entries
                    </div>
                )}
            </div>
        </div>
    );
}
