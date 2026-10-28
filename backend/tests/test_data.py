import os

os.environ["DB_NAME"] = "ma_finance_test"  # jamais la vraie base

from fastapi.testclient import TestClient  # noqa: E402

from server import app  # noqa: E402


def test_data_roundtrip():
    with TestClient(app) as c:
        from lib.db import db

        c.portal.call(db.app_data.delete_many, {})
        assert c.get("/api/data").status_code == 404  # base vide → le front sème le relevé
        data = {"version": 1, "accounts": [{"id": "acc-main"}], "transactions": []}
        assert c.put("/api/data", json=data).status_code == 204
        assert c.get("/api/data").json() == data
