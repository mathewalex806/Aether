import os
import json
import sqlite3
import gnupg
import httpx
import chromadb
from pathlib import Path
from contextlib import contextmanager
from fastapi import FastAPI, HTTPException, Header, Depends
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

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")

# ─── SQLite — primary memory store ───────────────────────────────────────────
def _init_db():
    with sqlite3.connect(DB_PATH) as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                title      TEXT PRIMARY KEY,
                content    TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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


def db_upsert(title: str, content: str):
    with _db() as con:
        con.execute("""
            INSERT INTO memories (title, content, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(title) DO UPDATE SET
                content    = excluded.content,
                updated_at = CURRENT_TIMESTAMP
        """, (title, content))


def db_delete(title: str):
    with _db() as con:
        con.execute("DELETE FROM memories WHERE title = ?", (title,))


def db_all() -> list[dict]:
    with _db() as con:
        rows = con.execute(
            "SELECT title, content FROM memories ORDER BY updated_at DESC"
        ).fetchall()
    return [{"title": r["title"], "content": r["content"]} for r in rows]


def db_keyword_search(query: str, n: int = 6) -> list[dict]:
    """Score every memory by how many query terms appear in title+content."""
    terms = [t for t in query.lower().split() if len(t) > 2]
    if not terms:
        return db_all()[:n]
    rows = db_all()
    scored = []
    for row in rows:
        haystack = (row["title"] + " " + row["content"]).lower()
        score = sum(1 for t in terms if t in haystack)
        if score > 0:
            scored.append((score, row))
    scored.sort(key=lambda x: -x[0])
    return [r for _, r in scored[:n]]


# ─── ChromaDB — vector store (best-effort) ───────────────────────────────────
chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
memory_collection = chroma_client.get_or_create_collection(
    name="memories",
    metadata={"hnsw:space": "cosine"},
)


def _get_embedding(text: str) -> list[float] | None:
    """
    Try embedding models in order of preference.
    Falls back to the first available chat model (all Ollama models support /api/embeddings).
    Returns None only if Ollama is completely unreachable.
    """
    candidates = ["nomic-embed-text", "all-minilm"]

    # Add whatever chat models are loaded
    try:
        resp = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if resp.status_code == 200:
            chat_models = [m["name"] for m in resp.json().get("models", [])]
            candidates += chat_models
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


def _chroma_upsert(title: str, content: str):
    emb = _get_embedding(f"{title}: {content}")
    if emb:
        memory_collection.upsert(
            ids=[title],
            embeddings=[emb],
            documents=[content],
            metadatas=[{"title": title}],
        )


def _chroma_delete(title: str):
    try:
        memory_collection.delete(ids=[title])
    except Exception:
        pass


# ─── Unified memory API ───────────────────────────────────────────────────────
def persist_memory(title: str, content: str):
    """Save to SQLite (always) and ChromaDB (best-effort)."""
    db_upsert(title, content)
    try:
        _chroma_upsert(title, content)
    except Exception:
        pass


def remove_memory(title: str):
    db_delete(title)
    _chroma_delete(title)


def search_memories(query: str, n: int = 6) -> list[dict]:
    """
    3-tier RAG retrieval so the agent is NEVER memory-blind:
      1. ChromaDB vector search (semantic)
      2. SQLite keyword search (lexical)
      3. All memories (brute-force last resort)
    """
    # Tier 1 — vector
    try:
        emb = _get_embedding(query)
        if emb and memory_collection.count() > 0:
            res = memory_collection.query(
                query_embeddings=[emb],
                n_results=min(n, memory_collection.count()),
            )
            hits = [
                {"title": m["title"], "content": doc}
                for m, doc in zip(res["metadatas"][0], res["documents"][0])
            ]
            if hits:
                return hits
    except Exception:
        pass

    # Tier 2 — keyword
    hits = db_keyword_search(query, n)
    if hits:
        return hits

    # Tier 3 — all (agent should see everything rather than nothing)
    return db_all()[:n]


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
    model: str
    messages: List[ChatMessage]
    journal_context: Optional[str] = None

class MemoryItem(BaseModel):
    title: str
    content: str


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


# ─── Memory CRUD REST (used by MemoryViewer UI) ───────────────────────────────
@app.get("/api/memories")
def list_memories():
    return {"memories": db_all()}


@app.get("/api/memories/{title}")
def get_memory(title: str):
    with _db() as con:
        row = con.execute(
            "SELECT title, content FROM memories WHERE title = ?", (title,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return {"title": row["title"], "content": row["content"]}


@app.post("/api/memories")
def save_memory_endpoint(item: MemoryItem):
    """Called when user confirms a suggested memory from the UI."""
    persist_memory(item.title, item.content)
    return {"status": "saved", "title": item.title}


@app.delete("/api/memories/{title}")
def delete_memory_endpoint(title: str):
    remove_memory(title)
    return {"status": "deleted"}


# ─── Chat streaming ───────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are Aether, a private and thoughtful AI journal companion.
Everything you process stays 100% local — nothing leaves this machine.

━━━ MEMORY INSTRUCTIONS ━━━
When you see a "What I remember about you:" section below, those facts come from your
long-term memory database. They are ground truth. Answer questions from them directly
and confidently — never say you don't know something that a memory covers.

You have two tools to record NEW information:

1. SAVE_MEMORY — only when the user EXPLICITLY says "remember", "save", or "store":
   <<<SAVE_MEMORY:snake_case_title|Full sentence describing the fact.>>>

2. SUGGEST_MEMORY — when you notice a significant lasting fact the user did NOT ask to save
   (preference, goal, relationship, health detail, recurring feeling).
   The user will be asked to confirm before it is stored:
   <<<SUGGEST_MEMORY:snake_case_title|Full sentence describing the fact.>>>

Rules:
- Answer from memory first. Be direct and confident when a memory is relevant.
- Never use SAVE_MEMORY unless the user explicitly asked.
- Titles: snake_case, max 3 words.
- After saving/suggesting, just acknowledge naturally — don't repeat the content.
- Be warm, concise, and empathetic.
"""

TOOL_MARKERS = ["<<<SAVE_MEMORY:", "<<<SUGGEST_MEMORY:"]
TOOL_END = ">>>"


async def _stream_chat(model: str, messages: list, journal_context: str | None):

    # ── RAG: inject relevant memories into the system prompt ─────────────────
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    relevant = search_memories(last_user)

    memory_section = ""
    if relevant:
        lines = [f"  • [{r['title'].replace('_', ' ')}]: {r['content']}" for r in relevant]
        memory_section = "What I remember about you:\n" + "\n".join(lines) + "\n\n"

    journal_section = ""
    if journal_context:
        journal_section = f"Journal context:\n---\n{journal_context}\n---\n\n"

    system_content = SYSTEM_PROMPT
    if memory_section or journal_section:
        system_content += "\n\n" + memory_section + journal_section

    ollama_messages = [{"role": "system", "content": system_content}] + [
        {"role": m["role"], "content": m["content"]} for m in messages
    ]

    # ── Stream + intercept tool markers ──────────────────────────────────────
    tool_buffer = ""
    collecting_tool: str | bool = False

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
                    tool_buffer += token

                while True:
                    if not collecting_tool:
                        found_marker, found_idx = None, len(tool_buffer)
                        for marker in TOOL_MARKERS:
                            idx = tool_buffer.find(marker)
                            if idx != -1 and idx < found_idx:
                                found_marker, found_idx = marker, idx

                        if found_marker is not None:
                            if found_idx > 0:
                                yield f"data: {json.dumps({'token': tool_buffer[:found_idx]})}\n\n"
                            tool_buffer = tool_buffer[found_idx:]
                            collecting_tool = found_marker
                        else:
                            safe = tool_buffer[:-20] if len(tool_buffer) > 20 else ""
                            if safe:
                                yield f"data: {json.dumps({'token': safe})}\n\n"
                                tool_buffer = tool_buffer[-20:]
                            break
                    else:
                        end_idx = tool_buffer.find(TOOL_END, len(collecting_tool))
                        if end_idx == -1:
                            break

                        call_body = tool_buffer[len(collecting_tool):end_idx]
                        after     = tool_buffer[end_idx + len(TOOL_END):]
                        is_save   = collecting_tool == "<<<SAVE_MEMORY:"
                        collecting_tool = False
                        tool_buffer = after

                        if "|" in call_body:
                            title, content = call_body.split("|", 1)
                            title   = title.strip().replace(" ", "_").lower()
                            content = content.strip()

                            if is_save:
                                persist_memory(title, content)
                                yield f"data: {json.dumps({'tool': 'save_memory', 'title': title, 'content': content})}\n\n"
                            else:
                                yield f"data: {json.dumps({'tool': 'suggest_memory', 'title': title, 'content': content})}\n\n"

                if chunk.get("done"):
                    if tool_buffer and not collecting_tool:
                        yield f"data: {json.dumps({'token': tool_buffer})}\n\n"
                    break

    yield f"data: {json.dumps({'done': True})}\n\n"


@app.post("/api/chat")
async def chat(req: ChatRequest, password: str = Depends(get_password)):
    verify_password(password)
    return StreamingResponse(
        _stream_chat(req.model, [m.dict() for m in req.messages], req.journal_context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )