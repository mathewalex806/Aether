# AetherJournal — Walkthrough

## What Was Built

A fully encrypted, private journaling application with:
- **Python/FastAPI backend** using `python-gnupg` (AES-256 symmetric encryption)
- **React/Vite frontend** with a premium dark-mode UI
- **Docker Compose** setup with a bind mount for `.gpg` file persistence

## Project Structure

```
secure-journal/
├── docker-compose.yml
├── data/                      # Your .gpg files live here (on host machine)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app.py                 # FastAPI with gnupg encryption API
└── frontend/
    ├── Dockerfile
    ├── vite.config.js          # Proxy: /api → backend:8000
    └── src/
        ├── index.css           # Full design system (dark mode, animations)
        ├── api.js              # API client (password as x-password header)
        ├── App.jsx             # Root: auth state + layout orchestration
        ├── AuthScreen.jsx      # Password gate with animated background
        ├── Sidebar.jsx         # File list, search, new entry form
        └── Editor.jsx          # Decrypts on load, encrypts on save
```

## How Encryption Works

1. **First launch**: Enter a passphrase → backend creates `.sentinel.gpg` using AES-256
2. **Subsequent launches**: Backend decrypts `.sentinel.gpg` to verify passphrase
3. **Files on disk**: Every `.gpg` file is fully encrypted — unreadable without the passphrase
4. **In transit**: Password is sent as an HTTP header (stays within Docker's private `journal-net` bridge network)
5. **In memory only**: The password is never written to disk or localStorage

## Verification

- ✅ `vite build` completed with no errors
- ✅ All React components compile cleanly
- ✅ Docker images build successfully

## How to Start

```bash
cd /home/alex/Desktop/Aether/secure-journal
docker compose up --build
```

Then open: [http://localhost:5173](http://localhost:5173)
