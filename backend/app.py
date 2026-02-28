import os
import gnupg
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
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

DATA_DIR = "/data"
if not os.environ.get("DOCKER_ENV"):
    DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))

os.makedirs(DATA_DIR, exist_ok=True)
gpg_home = os.path.join(DATA_DIR, ".gnupg")
os.makedirs(gpg_home, exist_ok=True)
gpg = gnupg.GPG(gnupghome=gpg_home)

def get_password(x_password: str = Header(None)):
    if not x_password:
        raise HTTPException(status_code=401, detail="Password required")
    return x_password

class JournalEntry(BaseModel):
    content: str
    
@app.get("/api/verify")
def verify_password(password: str = Depends(get_password)):
    # Create a test file, encrypt it, and try to decrypt to verify password capability
    # Actually, symmetric encryption just uses the password directly.
    # To verify the password is "correct", we would need a sentinel file.
    test_file = os.path.join(DATA_DIR, ".sentinel.gpg")
    if not os.path.exists(test_file):
        # Create sentinel
        encrypted_data = gpg.encrypt("valid", symmetric="AES256", passphrase=password, recipients=None)
        with open(test_file, 'wb') as f:
            f.write(encrypted_data.data)
        return {"status": "ok", "message": "Set new password"}
    else:
        # Check sentinel
        with open(test_file, 'rb') as f:
            decrypted_data = gpg.decrypt_file(f, passphrase=password)
            if not decrypted_data.ok:
                raise HTTPException(status_code=401, detail="Invalid password")
        return {"status": "ok"}

@app.get("/api/files")
def list_files(password: str = Depends(get_password)):
    # Verify first
    verify_password(password)
    
    files = []
    for f in os.listdir(DATA_DIR):
        if f.endswith(".gpg") and not f.startswith("."):
            # We just return the filename without .gpg
            files.append(f[:-4])
    return {"files": sorted(files, reverse=True)}

@app.get("/api/files/{name}")
def read_file(name: str, password: str = Depends(get_password)):
    verify_password(password)
    filepath = os.path.join(DATA_DIR, f"{name}.gpg")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
        
    with open(filepath, 'rb') as f:
        decrypted_data = gpg.decrypt_file(f, passphrase=password)
        if not decrypted_data.ok:
            raise HTTPException(status_code=401, detail="Failed to decrypt file")
            
    return {"name": name, "content": str(decrypted_data)}

@app.post("/api/files/{name}")
def save_file(name: str, entry: JournalEntry, password: str = Depends(get_password)):
    verify_password(password)
    filepath = os.path.join(DATA_DIR, f"{name}.gpg")
    
    # Also encrypt the content with AES256 symmetrically
    encrypted_data = gpg.encrypt(entry.content, symmetric="AES256", passphrase=password, recipients=None)
    if not encrypted_data.ok:
         raise HTTPException(status_code=500, detail=f"Encryption failed {encrypted_data.stderr}")
         
    with open(filepath, 'wb') as f:
        f.write(encrypted_data.data)
        
    return {"status": "saved"}

@app.delete("/api/files/{name}")
def delete_file(name: str, password: str = Depends(get_password)):
    verify_password(password)
    filepath = os.path.join(DATA_DIR, f"{name}.gpg")
    if os.path.exists(filepath):
        os.remove(filepath)
    return {"status": "deleted"}
