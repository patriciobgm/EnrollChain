from .models import AuditEvent


def _client_ip(request):
    if request is None:
        return None
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.META.get("REMOTE_ADDR")


def record_audit_event(*, action, entity, entity_id="", user=None, request=None, metadata=None):
    return AuditEvent.objects.create(
        action=action,
        entity=entity,
        entity_id=str(entity_id),
        user=user if getattr(user, "is_authenticated", False) else None,
        ip_address=_client_ip(request),
        metadata=metadata or {},
    )
