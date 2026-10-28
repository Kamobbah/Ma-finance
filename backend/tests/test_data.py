import os

os.environ["DB_NAME"] = "ma_finance_test"  # jamais la vraie base

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import app  # noqa: E402


@pytest.fixture(scope="module")
def c():
    with TestClient(app) as client:  # un seul client : Motor reste lié à une seule boucle
        yield client


def test_data_roundtrip(c):
    from lib.db import db

    c.portal.call(db.app_data.delete_many, {})
    assert c.get("/api/data").status_code == 404  # base vide → le front sème le relevé
    data = {"version": 1, "accounts": [{"id": "acc-main"}], "transactions": []}
    assert c.put("/api/data", json=data).status_code == 204
    assert c.get("/api/data").json() == data


def test_attachment_roundtrip_and_size_limit(c):
    r = c.post("/api/attachments", content=b"\x89PNG-fake", headers={"Content-Type": "image/png"})
    assert r.status_code == 200
    got = c.get(r.json()["url"])
    assert got.content == b"\x89PNG-fake" and got.headers["content-type"] == "image/png"
    big = c.post("/api/attachments", content=b"0" * (3 * 1024 * 1024 + 1), headers={"Content-Type": "image/png"})
    assert big.status_code == 413
