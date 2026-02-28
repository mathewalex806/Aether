import { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, Info } from 'lucide-react';
import { api } from './api';

export default function AuthScreen({ onAuthenticated }) {
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e) {
        e.preventDefault();
        if (!password) return;
        setLoading(true);
        setError('');
        try {
            const res = await api.verify(password);
            onAuthenticated(password, res.message === 'Set new password');
        } catch (err) {
            setError(err.message === 'Invalid password' ? 'Incorrect password. Please try again.' : err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-screen">
            <div className="auth-bg-orb orb-1" />
            <div className="auth-bg-orb orb-2" />

            <div className="auth-card">
                <div className="auth-logo">
                    <div className="auth-logo-icon">
                        <ShieldCheck size={22} color="white" />
                    </div>
                    <div className="auth-logo-text">
                        <h1>AetherJournal</h1>
                        <p>End-to-end encrypted</p>
                    </div>
                </div>

                <h2 className="auth-title">Unlock your vault</h2>
                <p className="auth-subtitle">
                    Your journal entries are encrypted with AES-256 via GnuPG.
                    Enter your passphrase to continue.
                </p>

                {error && (
                    <div className="auth-error">
                        <AlertCircle size={15} />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Master Passphrase</label>
                        <div className="input-wrapper">
                            <span className="input-icon"><Lock size={16} /></span>
                            <input
                                type={showPw ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your passphrase..."
                                autoFocus
                            />
                            <button
                                type="button"
                                className="input-toggle"
                                onClick={() => setShowPw(!showPw)}
                            >
                                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <button type="submit" className="btn-primary" disabled={loading || !password}>
                        {loading ? <div className="spinner" /> : <ShieldCheck size={16} />}
                        {loading ? 'Verifying...' : 'Unlock Journal'}
                    </button>
                </form>

                <div className="auth-note">
                    <Info size={14} style={{ marginTop: 2, flexShrink: 0, color: 'var(--text-accent)' }} />
                    <span>
                        First use? A new encrypted vault will be created. Store your passphrase safely — it cannot be recovered.
                    </span>
                </div>
            </div>
        </div>
    );
}
