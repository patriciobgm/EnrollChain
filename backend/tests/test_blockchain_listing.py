# ruff: noqa: F811
from urllib.parse import urlsplit

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.blockchain_records.models import BlockchainTransaction
from tests.test_admissions import create_application, setup  # noqa: F401
from tests.test_early_enrollment import school  # noqa: F401

pytestmark = pytest.mark.django_db


def proof(number, **extra):
    return BlockchainTransaction.objects.create(
        operation_key=extra.pop("operation_key", f"TEST:{number}"),
        record_type="PRE_ENROLLMENT_CONFIRMED",
        record_hash=f"{number:064x}",
        opaque_reference=f"{number + 1000:064x}",
        transaction_hash=f"0x{number + 2000:064x}",
        **extra,
    )


def local_url(url):
    parsed = urlsplit(url)
    return parsed.path + "?" + parsed.query


def test_cursor_pages_are_bounded_without_count_and_stable_on_new_insert(school):
    reg = school[1]["REGISTRAR"][1]
    expected = {str(proof(i).pk) for i in range(45)}
    with CaptureQueriesContext(connection) as queries:
        first = reg.get("/api/v1/blockchain-records/")
    assert first.status_code == 200 and len(first.data["results"]) == 20
    sql = [q["sql"] for q in queries if "blockchain_records_blockchaintransaction" in q["sql"]]
    assert sql and not any("COUNT(" in q.upper() for q in sql)
    assert any("LIMIT 21" in q.upper() for q in sql)
    assert "count" not in first.data
    proof(100)  # Newly arriving proof must not shift the continuation page.
    seen = [row["id"] for row in first.data["results"]]
    next_url = first.data["next"]
    while next_url:
        result = reg.get(local_url(next_url))
        assert len(result.data["results"]) <= 20
        seen.extend(row["id"] for row in result.data["results"])
        next_url = result.data["next"]
    assert len(seen) == len(set(seen)) == 45 and set(seen) == expected
    assert reg.get("/api/v1/blockchain-records/?cursor=invalid").status_code == 404


def test_blockchain_filters_sort_and_private_scope(school):
    app = create_application(school[0])
    own = proof(1, operation_key=f"PRE_ENROLLMENT_CONFIRMED:{app['id']}", status="CONFIRMED")
    foreign = proof(2, status="FAILED")
    reg = school[1]["REGISTRAR"][1]
    url = "/api/v1/blockchain-records/"
    assert [x["id"] for x in reg.get(url + "?status=CONFIRMED").data["results"]] == [str(own.pk)]
    for digest in [
        own.record_hash,
        "0x" + own.record_hash,
        own.transaction_hash,
        own.opaque_reference,
    ]:
        assert [x["id"] for x in reg.get(url + "?search=" + digest).data["results"]] == [
            str(own.pk)
        ]
    assert reg.get(url + "?ordering=created_at").data["results"][0]["id"] == str(own.pk)
    assert reg.get(url + "?ordering=-created_at").data["results"][0]["id"] == str(foreign.pk)
    assert reg.get(url + "?record_type=DOCUMENT_VERIFIED").data["results"] == []
    for params in [
        "status=invalid",
        "record_type=INVALID",
        "search=short",
        "ordering=status",
        "from=bad",
        "from=2026-10-25&to=2026-10-24",
    ]:
        assert reg.get(url + "?" + params).status_code == 400
    owner = school[0][0]
    assert [x["id"] for x in owner.get(url).data["results"]] == [str(own.pk)]
    assert owner.get(url + str(foreign.pk) + "/").status_code == 404
    assert owner.get(url + "?search=" + foreign.transaction_hash).data["results"] == []
    assert school[1]["CLASS_ADVISER"][1].get(url).status_code == 403
    assert APIClient().get(url).status_code == 401
