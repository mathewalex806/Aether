import { useState, useEffect, useCallback } from 'react';
import { BookOpen, MessageSquare, Brain } from 'lucide-react';
import AuthScreen from './AuthScreen';
import Sidebar from './Sidebar';
import Editor from './Editor';
import Chat from './Chat';
import MemoryViewer from './MemoryViewer';
import { api } from './api';

function WelcomeState() {
  return (
    <div className="welcome-state">
      <div className="welcome-inner">
        <div className="welcome-graphic"><BookOpen size={36} /></div>
        <h2>Select an entry</h2>
        <p>Choose a journal entry from the sidebar, or create a new one with the <strong>+</strong> button.</p>
      </div>
    </div>
  );
}

const NAV_TABS = [
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'memories', label: 'Memories', icon: Brain },
];

export default function App() {
  const [password, setPassword] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [activeTab, setActiveTab] = useState('journal');

  const loadFiles = useCallback(async (pw) => {
    setLoadingFiles(true);
    try {
      const data = await api.listFiles(pw || password);
      setFiles(data.files);
    } catch (err) {
      console.error('Failed to list files:', err);
    } finally {
      setLoadingFiles(false);
    }
  }, [password]);

  useEffect(() => {
    if (password) loadFiles(password);
  }, [password]);

  function handleAuthenticated(pw) { setPassword(pw); }

  function handleLock() {
    setPassword(null);
    setFiles([]);
    setSelectedFile(null);
    setActiveTab('journal');
  }

  function handleNewFile(name) {
    if (!files.includes(name)) setFiles(prev => [name, ...prev]);
    setSelectedFile(name);
  }

  function handleDeleteFile(name) {
    setFiles(prev => prev.filter(f => f !== name));
    setSelectedFile(null);
    loadFiles(password);
  }

  if (!password) return <AuthScreen onAuthenticated={handleAuthenticated} />;

  return (
    <div className="app-layout">
      {/* Sidebar only shown in journal view */}
      {activeTab === 'journal' && (
        <Sidebar
          files={files}
          selected={selectedFile}
          onSelect={setSelectedFile}
          onNew={handleNewFile}
          onLock={handleLock}
          loading={loadingFiles}
        />
      )}

      <main className="main-content">
        {/* Top navigation tabs */}
        <nav className="app-nav">
          <div className="app-nav-left">
            {NAV_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`nav-tab ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          {activeTab !== 'journal' && (
            <button className="nav-lock-btn" onClick={handleLock} title="Lock vault">
              🔒 Lock
            </button>
          )}
        </nav>

        {/* Views */}
        {activeTab === 'journal' && (
          selectedFile
            ? <Editor key={selectedFile} name={selectedFile} password={password} onSaved={() => loadFiles(password)} onDeleted={handleDeleteFile} />
            : <WelcomeState />
        )}
        {activeTab === 'chat' && (
          <Chat password={password} journalFiles={files} />
        )}
        {activeTab === 'memories' && (
          <MemoryViewer password={password} />
        )}
      </main>
    </div>
  );
}
