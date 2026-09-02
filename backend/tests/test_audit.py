import pytest

from apps.audit.services import record_audit_event


@pytest.mark.django_db
def test_audit_event_cannot_be_modified():
    event = record_audit_event(action="TEST", entity="Foundation", entity_id="one")
    event.entity_id = "two"

    with pytest.raises(TypeError, match="append-only"):
        event.save()
