"""Audit log helper — never store passwords or token secrets."""
from __future__ import annotations

import json
from sqlalchemy.orm import Session
from app.modules.users.models import AuditLog


def log_action(
    db: Session,
    *,
    action: str,
    actor_id: int | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    metadata: dict | None = None,
) -> AuditLog:
    safe_meta = {}
    if metadata:
        for k, v in metadata.items():
            kl = k.lower()
            if any(s in kl for s in ("password", "token", "secret", "hash")):
                continue
            safe_meta[k] = v
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        meta_info=json.dumps(safe_meta) if safe_meta else None,
    )
    db.add(entry)
    return entry
