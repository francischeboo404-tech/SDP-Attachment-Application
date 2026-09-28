import re
import json
from django.utils import timezone


def get_client_ip(request):
    if not request:
        return None
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        ip = x_forwarded_for.split(",")[0].strip()
    else:
        ip = request.META.get("REMOTE_ADDR")
    return ip


SENSITIVE_KEYS = {
    "password", "token", "secret", "secret_key", "client_secret",
    "access_token", "refresh_token", "encrypted_value", "key_value"
}


def sanitize_metadata(data):
    if not isinstance(data, dict):
        return data
    sanitized = {}
    for k, v in data.items():
        if any(sk in k.lower() for sk in SENSITIVE_KEYS):
            sanitized[k] = "[REDACTED_SECRET]"
        elif isinstance(v, dict):
            sanitized[k] = sanitize_metadata(v)
        elif isinstance(v, list):
            sanitized[k] = [
                sanitize_metadata(item) if isinstance(item, dict) else item
                for item in v
            ]
        else:
            sanitized[k] = v
    return sanitized


def log_audit_event(request_or_actor=None, action="", target_description="", metadata=None, ip_address=None, actor=None):
    """
    Standardized helper to write to AuditLog without exposing sensitive plaintext secrets.
    """
    try:
        from .models import AuditLog
        from django.contrib.auth import get_user_model
        User = get_user_model()

        actual_actor = actor
        ip = ip_address

        if isinstance(request_or_actor, User):
            actual_actor = request_or_actor
        elif request_or_actor and hasattr(request_or_actor, "user"):
            if request_or_actor.user and request_or_actor.user.is_authenticated:
                actual_actor = request_or_actor.user
            if not ip:
                ip = get_client_ip(request_or_actor)

        clean_meta = sanitize_metadata(metadata or {})

        log_entry = AuditLog.objects.create(
            actor=actual_actor,
            action=action,
            target_description=str(target_description)[:255],
            metadata=clean_meta,
            ip_address=ip or "127.0.0.1",
        )
        return log_entry
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to log audit event: {e}")
        return None
