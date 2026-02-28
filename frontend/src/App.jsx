import { useState, useEffect, useCallback } from 'react';
import { BookOpen } from 'lucide-react';
import AuthScreen from './AuthScreen';
import Sidebar from './Sidebar';
import Editor from './Editor';
import { api } from './api';

function WelcomeState() {
  return (
    <div className="welcome-state">
      <div className="welcome-inner">
        <div className="welcome-graphic">
          <BookOpen size={36} />
        </div>
        <h2>Select an entry</h2>
        <p>Choose a journal entry from the sidebar, or create a new one with the <strong>+</strong> button.</p>
      </div>
    </div>
  );
}

export default function App() {
  const [password, setPassword] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const authenticated = !!password;

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

  function handleAuthenticated(pw) {
    setPassword(pw);
  }

  function handleLock() {
    setPassword(null);
    setFiles([]);
    setSelectedFile(null);
  }

  function handleNewFile(name) {
    // Pre-create entry in list, open it for editing; 
    // it'll be saved upon first save action
    if (!files.includes(name)) {
      setFiles((prev) => [name, ...prev]);
    }
    setSelectedFile(name);
  }

  function handleDeleteFile(name) {
    setFiles((prev) => prev.filter((f) => f !== name));
    setSelectedFile(null);
    // Reload to stay in sync
    loadFiles(password);
  }

  function handleSaved() {
    loadFiles(password);
  }

  if (!authenticated) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="app-layout">
      <Sidebar
        files={files}
        selected={selectedFile}
        onSelect={setSelectedFile}
        onNew={handleNewFile}
        onLock={handleLock}
        loading={loadingFiles}
      />
      <main className="main-content">
        {selectedFile ? (
          <Editor
            key={selectedFile}
            name={selectedFile}
            password={password}
            onSaved={handleSaved}
            onDeleted={handleDeleteFile}
          />
        ) : (
          <WelcomeState />
        )}
      </main>
    </div>
  );
}
