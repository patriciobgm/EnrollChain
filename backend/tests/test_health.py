import pytest
from django.urls import reverse


@pytest.mark.django_db
def test_health_endpoint_reports_database(client):
    response = client.get(reverse("health"))

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "available",
        "blockchain_enabled": False,
    }


@pytest.mark.django_db
def test_health_uses_client_blockchain_configuration(client, settings, tmp_path):
    settings.CLIENT_TEST_MODE = True
    settings.BLOCKCHAIN_LOCAL_CONFIG = True
    settings.BLOCKCHAIN_CONFIG_FILE = tmp_path / "blockchain.json"
    settings.BLOCKCHAIN_CONFIG_FILE.write_text('{"contract_address": "0x123"}')

    response = client.get(reverse("health"))

    assert response.status_code == 200
    assert response.json()["blockchain_enabled"] is True
