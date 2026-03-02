import os
import json
import sqlite3
import gnupg
import httpx
import chromadb
from pathlib import Path
from contextlib import contextmanager
from fastapi import FastAPI, HTTPException, Header, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Paths ────────────────────────────────────────────────────────────────────
DATA_DIR = Path("/data") if os.environ.get("DOCKER_ENV") else Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH    = str(DATA_DIR / "memories.db")
CHROMA_DIR = str(DATA_DIR / ".chromadb")

gpg_home = str(DATA_DIR / ".gnupg")
os.makedirs(gpg_home, exist_ok=True)
gpg = gnupg.GPG(gnupghome=gpg_home)
gpg.encoding = "utf-8"

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

# ─── SQLite ───────────────────────────────────────────────────────────────────
def _init_db():
    with sqlite3.connect(DB_PATH) as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                title        TEXT    NOT NULL,
                journal_name TEXT,               -- NULL = global
                content      TEXT    NOT NULL,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (title, journal_name)
            )
        """)
        con.commit()

_init_db()


@contextmanager
def _db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


# ─── SQLite CRUD (all scoped) ─────────────────────────────────────────────────

def db_upsert(title: str, content: str, journal_name: str | None):
    """Insert or update a memory. journal_name=None means global."""
    with _db() as con:
        con.execute("""
            INSERT INTO memories (title, journal_name, content, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(title, journal_name) DO UPDATE SET
                content    = excluded.content,
                updated_at = CURRENT_TIMESTAMP
        """, (title, journal_name, content))


def db_delete(title: str, journal_name: str | None):
    with _db() as con:
        con.execute(
            "DELETE FROM memories WHERE title = ? AND journal_name IS ?",
            (title, journal_name)
        )


def db_all(journal_name: str | None = None, include_global: bool = False) -> list[dict]:
    with _db() as con:
        if journal_name is None and not include_global:
            rows = con.execute(
                "SELECT title, journal_name, content FROM memories ORDER BY journal_name, updated_at DESC"
            ).fetchall()
        elif journal_name is not None and not include_global:
            rows = con.execute(
                "SELECT title, journal_name, content FROM memories WHERE journal_name = ? ORDER BY updated_at DESC",
                (journal_name,)
            ).fetchall()
        else:
            rows = con.execute(
                """SELECT title, journal_name, content FROM memories
                   WHERE journal_name = ? OR journal_name IS NULL
                   ORDER BY updated_at DESC""",
                (journal_name,)
            ).fetchall()
    return [{"title": r["title"], "journal_name": r["journal_name"], "content": r["content"]} for r in rows]


def db_keyword_search(query: str, journal_name: str | None, include_global: bool, n: int = 6) -> list[dict]:
    terms = [t for t in query.lower().split() if len(t) > 2]
    rows  = db_all(journal_name, include_global)
    if not terms:
        return rows[:n]
    scored = []
    for row in rows:
        haystack = (row["title"] + " " + row["content"]).lower()
        score = sum(1 for t in terms if t in haystack)
        if score > 0:
            scored.append((score, row))
    scored.sort(key=lambda x: -x[0])
    return [r for _, r in scored[:n]]


# ─── ChromaDB ─────────────────────────────────────────────────────────────────
chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
memory_collection = chroma_client.get_or_create_collection(
    name="memories",
    metadata={"hnsw:space": "cosine"},
)


def _chroma_id(title: str, journal_name: str | None) -> str:
    scope = journal_name or "__global__"
    return f"{scope}::{title}"


def _get_embedding(text: str) -> list[float] | None:
    candidates = ["nomic-embed-text", "all-minilm"]
    try:
        resp = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if resp.status_code == 200:
            candidates += [m["name"] for m in resp.json().get("models", [])]
    except Exception:
        pass

    for model in candidates:
        try:
            r = httpx.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={"model": model, "prompt": text},
                timeout=30,
            )
            if r.status_code == 200:
                emb = r.json().get("embedding")
                if emb:
                    return emb
        except Exception:
            continue
    return None


def _chroma_upsert(title: str, content: str, journal_name: str | None):
    emb = _get_embedding(f"{title}: {content}")
    if emb:
        doc_id = _chroma_id(title, journal_name)
        memory_collection.upsert(
            ids=[doc_id],
            embeddings=[emb],
            documents=[content],
            metadatas=[{
                "title":        title,
                "journal_name": journal_name or "__global__",
            }],
        )


def _chroma_delete(title: str, journal_name: str | None):
    try:
        memory_collection.delete(ids=[_chroma_id(title, journal_name)])
    except Exception:
        pass


def _chroma_search(query: str, journal_name: str | None, include_global: bool, n: int) -> list[dict]:
    emb = _get_embedding(query)
    if not emb or memory_collection.count() == 0:
        return []

    if journal_name is None:
        where = None
    elif include_global:
        where = {"$or": [
            {"journal_name": {"$eq": journal_name}},
            {"journal_name": {"$eq": "__global__"}},
        ]}
    else:
        where = {"journal_name": {"$eq": journal_name}}

    try:
        kwargs = dict(query_embeddings=[emb], n_results=min(n, memory_collection.count()))
        if where:
            kwargs["where"] = where
        res = memory_collection.query(**kwargs)
        return [
            {
                "title":        m["title"],
                "journal_name": None if m["journal_name"] == "__global__" else m["journal_name"],
                "content":      doc,
            }
            for m, doc in zip(res["metadatas"][0], res["documents"][0])
        ]
    except Exception:
        return []


# ─── Unified memory API ───────────────────────────────────────────────────────

def persist_memory(title: str, content: str, journal_name: str | None):
    """Write to SQLite + ChromaDB, both scoped to journal_name (None = global)."""
    db_upsert(title, content, journal_name)
    try:
        _chroma_upsert(title, content, journal_name)
    except Exception:
        pass


def remove_memory(title: str, journal_name: str | None):
    db_delete(title, journal_name)
    _chroma_delete(title, journal_name)


def search_memories(query: str, journal_name: str | None, n: int = 6) -> list[dict]:
    """
    3-tier RAG, scoped to journal first, then falling back to global memories.
    Tier 1 → ChromaDB vector search (journal + global)
    Tier 2 → SQLite keyword search (journal + global)
    Tier 3 → All memories for this journal + all globals (last resort)
    """
    include_global = journal_name is not None

    hits = _chroma_search(query, journal_name, include_global, n)
    if hits:
        return hits

    hits = db_keyword_search(query, journal_name, include_global, n)
    if hits:
        return hits

    return db_all(journal_name, include_global)[:n]


# ─── Auth ─────────────────────────────────────────────────────────────────────
def get_password(x_password: str = Header(None)):
    if not x_password:
        raise HTTPException(status_code=401, detail="Password required")
    return x_password


# ─── Pydantic models ──────────────────────────────────────────────────────────
class JournalEntry(BaseModel):
    content: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model:           str
    messages:        List[ChatMessage]
    journal_context: Optional[str]  = None   # decrypted journal text
    journal_name:    Optional[str]  = None   # journal filename (e.g. "2024-01-15")

class MemoryItem(BaseModel):
    title:        str
    content:      str
    journal_name: Optional[str] = None

class SaveMessageAsMemoryRequest(BaseModel):
    """Explicit user-triggered save of a specific chat message to memory."""
    content:      str                  # the message text to save
    title:        Optional[str] = None # optional custom title; auto-generated if omitted
    journal_name: Optional[str] = None # scope (None = global)


# ─── Journal endpoints ────────────────────────────────────────────────────────
@app.get("/api/verify")
def verify_password(password: str = Depends(get_password)):
    test_file = DATA_DIR / ".sentinel.gpg"
    if not test_file.exists():
        enc = gpg.encrypt("valid", symmetric="AES256", passphrase=password, recipients=None)
        test_file.write_bytes(enc.data)
        return {"status": "ok", "message": "Set new password"}
    dec = gpg.decrypt_file(open(test_file, "rb"), passphrase=password)
    if not dec.ok:
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"status": "ok"}


@app.get("/api/files")
def list_files(password: str = Depends(get_password)):
    verify_password(password)
    files = [f.stem for f in DATA_DIR.glob("*.gpg") if not f.name.startswith(".")]
    return {"files": sorted(files, reverse=True)}


@app.get("/api/files/{name}")
def read_file(name: str, password: str = Depends(get_password)):
    verify_password(password)
    filepath = DATA_DIR / f"{name}.gpg"
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    dec = gpg.decrypt_file(open(filepath, "rb"), passphrase=password)
    if not dec.ok:
        raise HTTPException(status_code=401, detail="Failed to decrypt")
    return {"name": name, "content": str(dec)}


@app.post("/api/files/{name}")
def save_file(name: str, entry: JournalEntry, password: str = Depends(get_password)):
    verify_password(password)
    enc = gpg.encrypt(entry.content, symmetric="AES256", passphrase=password, recipients=None)
    if not enc.ok:
        raise HTTPException(status_code=500, detail=f"Encryption failed: {enc.stderr}")
    (DATA_DIR / f"{name}.gpg").write_bytes(enc.data)
    return {"status": "saved"}


@app.delete("/api/files/{name}")
def delete_file(name: str, password: str = Depends(get_password)):
    verify_password(password)
    filepath = DATA_DIR / f"{name}.gpg"
    if filepath.exists():
        filepath.unlink()
    return {"status": "deleted"}


# ─── Ollama / Models ──────────────────────────────────────────────────────────
@app.get("/api/models")
def list_models():
    try:
        resp = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        resp.raise_for_status()
        return {"models": [m["name"] for m in resp.json().get("models", [])]}
    except Exception as e:
        return {"models": [], "error": str(e)}


# ─── Memory CRUD REST ─────────────────────────────────────────────────────────

@app.get("/api/memories")
def list_memories(journal: Optional[str] = Query(None)):
    return {"memories": db_all(journal_name=journal)}


@app.get("/api/memories/{title}")
def get_memory(title: str, journal: Optional[str] = Query(None)):
    with _db() as con:
        row = con.execute(
            "SELECT title, journal_name, content FROM memories WHERE title = ? AND journal_name IS ?",
            (title, journal)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return {"title": row["title"], "journal_name": row["journal_name"], "content": row["content"]}


@app.post("/api/memories")
def save_memory_endpoint(item: MemoryItem):
    """Save a memory directly (e.g. from the memory manager UI)."""
    persist_memory(item.title, item.content, item.journal_name)
    return {"status": "saved", "title": item.title, "journal_name": item.journal_name}


@app.post("/api/memories/save-message")
def save_message_as_memory(req: SaveMessageAsMemoryRequest):
    """
    Explicit user-triggered endpoint: save a specific chat message as a memory.
    If no title is provided, one is auto-generated from the first few words.
    """
    title = req.title
    if not title:
        # Auto-generate a snake_case title from the first ~5 words
        words = req.content.strip().split()[:5]
        title = "_".join(w.lower().strip(".,!?;:'\"") for w in words if w)
        title = title[:60]  # cap length

    persist_memory(title, req.content, req.journal_name)
    return {"status": "saved", "title": title, "journal_name": req.journal_name}


@app.delete("/api/memories/{title}")
def delete_memory_endpoint(title: str, journal: Optional[str] = Query(None)):
    remove_memory(title, journal)
    return {"status": "deleted"}


# ─── Chat streaming ───────────────────────────────────────────────────────────

# The system prompt no longer instructs the model to auto-suggest or auto-save
# memories. Memory saving is now 100% user-driven via the UI dropdown.
SYSTEM_PROMPT = """You are Aether, a private and thoughtful AI journal companion.
Everything you process stays 100% local — nothing leaves this machine.

━━━ MEMORY INSTRUCTIONS ━━━
When you see a "What I remember" section below, those facts come from your long-term memory
database. They are ground truth. Answer questions from them directly and confidently.
Never say you don't know something that a memory already covers.

Do NOT emit any <<<...>>> tool blocks. Memory saving is handled entirely by the user
through the interface — you never save or suggest saving memories on your own.

Guidelines:
- Answer from memory first when relevant. Be direct and confident.
- Be warm, concise, and empathetic.
- When referring to past context from memories, acknowledge it naturally.
"""

# Journal-pane agent uses the same system prompt but receives the full journal
# text as additional context. A separate endpoint lets the frontend distinguish
# "journal agent" from "standalone agent" without any backend logic change —
# both go through /api/chat; the journal_context and journal_name fields carry
# the distinction.


async def _stream_chat(
    model:           str,
    messages:        list,
    journal_context: str | None,
    journal_name:    str | None,
):
    # ── RAG: retrieve memories scoped to this journal (+ globals) ────────────
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    relevant  = search_memories(last_user, journal_name)

    memory_section = ""
    if relevant:
        scope_label = f'from journal "{journal_name}"' if journal_name else "global"
        lines = []
        for r in relevant:
            jname = r.get("journal_name")
            badge = f'[{jname}]' if jname else '[global]'
            lines.append(f"  • {badge} {r['title'].replace('_', ' ')}: {r['content']}")
        memory_section = f"What I remember ({scope_label} + global):\n" + "\n".join(lines) + "\n\n"

    journal_section = ""
    if journal_context:
        label = f'Journal entry "{journal_name}"' if journal_name else "Journal context"
        journal_section = f"{label}:\n---\n{journal_context}\n---\n\n"

    system_content = SYSTEM_PROMPT
    if memory_section or journal_section:
        system_content += "\n\n" + memory_section + journal_section

    ollama_messages = [{"role": "system", "content": system_content}] + [
        {"role": m["role"], "content": m["content"]} for m in messages
    ]

    # ── Stream tokens straight to the client (no tool interception needed) ───
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_URL}/api/chat",
            json={"model": model, "messages": ollama_messages, "stream": True},
        ) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                yield f"data: {json.dumps({'error': body.decode()})}\n\n"
                return

            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue

                token = chunk.get("message", {}).get("content", "")
                if token:
                    yield f"data: {json.dumps({'token': token})}\n\n"

                if chunk.get("done"):
                    break

    yield f"data: {json.dumps({'done': True})}\n\n"


@app.post("/api/chat")
async def chat(req: ChatRequest, password: str = Depends(get_password)):
    verify_password(password)
    return StreamingResponse(
        _stream_chat(
            model=req.model,
            messages=[m.dict() for m in req.messages],
            journal_context=req.journal_context,
            journal_name=req.journal_name,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )