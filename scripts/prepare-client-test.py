#!/usr/bin/env python3
"""Generate private configuration for the isolated Docker client test stack."""
import base64
import json
import os
import secrets
from pathlib import Path
root = Path(__file__).resolve().parents[1]
folder = root / ".client-test"
folder.mkdir(mode=0o700, exist_ok=True)
accounts = folder / "accounts.json"
if not accounts.exists():
    data = [{"email": f"{name}@enrollchain.test", "role": role,
             "password": "EC-" + secrets.token_urlsafe(18), "superuser": superuser}
        for name, role, superuser in [
            ("superadmin", "ADMINISTRATOR", True), ("admin", "ADMINISTRATOR", False),
            ("registrar", "REGISTRAR", False), ("learner", "LEARNER", False),
            ("guidance", "GUIDANCE_OFFICER", False),
            ("adviser", "CLASS_ADVISER", False)]]
    accounts.write_text(json.dumps(data, indent=2) + "\n")
    os.chmod(accounts, 0o600)
    sheet = folder / "LOGIN_ACCOUNTS.md"
    sheet.write_text("# Private Docker client-test accounts\n\nExisting local accounts are unchanged.\n\n| Email | Role | Password |\n|---|---|---|\n" + "".join(f"| {u['email']} | {'SUPERADMINISTRATOR' if u['superuser'] else u['role']} | {u['password']} |\n" for u in data))
    os.chmod(sheet, 0o600)
env = root / ".env.client"
if not env.exists():
    env.write_text(f"DJANGO_SECRET_KEY={secrets.token_urlsafe(48)}\nMFA_ENCRYPTION_KEY={base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()}\nPOSTGRES_PASSWORD={secrets.token_urlsafe(32)}\nDJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,backend\nCLIENT_BIND_ADDRESS=127.0.0.1\nCLIENT_WEB_PORT=8080\nDJANGO_SECURE_SSL_REDIRECT=false\nBLOCKCHAIN_ENABLED=false\n")
    os.chmod(env, 0o600)
print("Ready. Private login sheet: .client-test/LOGIN_ACCOUNTS.md")
print("Start: docker compose --env-file .env.client -f compose.client.yml up --build -d")
