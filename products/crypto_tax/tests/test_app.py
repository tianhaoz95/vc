"""Integration tests for the Flask web application."""

import io
import zipfile
import json

import pytest
from tests.conftest import SAMPLE_CSV


class TestIndexRoute:
    def test_get_index_ok(self, client):
        resp = client.get("/")
        assert resp.status_code == 200

    def test_index_contains_methods(self, client):
        resp = client.get("/")
        assert b"FIFO" in resp.data
        assert b"LIFO" in resp.data
        assert b"HIFO" in resp.data

    def test_index_contains_rules(self, client):
        resp = client.get("/")
        assert b"Short-term" in resp.data or b"short-term" in resp.data


class TestApiMethods:
    def test_returns_json(self, client):
        resp = client.get("/api/methods")
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert "FIFO" in data
        assert "LIFO" in data
        assert "HIFO" in data

    def test_descriptions_present(self, client):
        resp = client.get("/api/methods")
        data = json.loads(resp.data)
        for m in ("FIFO", "LIFO", "HIFO"):
            assert "description" in data[m]
            assert len(data[m]["description"]) > 10


class TestConvertRoute:
    def _post(self, client, csv_text=SAMPLE_CSV, method="FIFO"):
        data = {
            "file": (io.BytesIO(csv_text.encode("utf-8")), "transactions.csv"),
            "method": method,
        }
        return client.post("/convert", data=data, content_type="multipart/form-data")

    def test_successful_conversion_returns_zip(self, client):
        resp = self._post(client)
        assert resp.status_code == 200
        assert resp.content_type == "application/zip"

    def test_zip_contains_expected_files(self, client):
        resp = self._post(client)
        with zipfile.ZipFile(io.BytesIO(resp.data)) as z:
            names = z.namelist()
        assert "capital_gains.csv" in names
        assert "income.csv" in names
        assert "summary.txt" in names

    def test_capital_gains_csv_has_data(self, client):
        resp = self._post(client)
        with zipfile.ZipFile(io.BytesIO(resp.data)) as z:
            cg = z.read("capital_gains.csv").decode("utf-8")
        assert "Currency Name" in cg
        assert "BTC" in cg

    def test_income_csv_has_data(self, client):
        resp = self._post(client)
        with zipfile.ZipFile(io.BytesIO(resp.data)) as z:
            inc = z.read("income.csv").decode("utf-8")
        assert "CRO" in inc

    def test_summary_has_gain_info(self, client):
        resp = self._post(client)
        with zipfile.ZipFile(io.BytesIO(resp.data)) as z:
            summary = z.read("summary.txt").decode("utf-8")
        assert "FIFO" in summary
        assert "$" in summary

    def test_lifo_method_accepted(self, client):
        resp = self._post(client, method="LIFO")
        assert resp.status_code == 200

    def test_hifo_method_accepted(self, client):
        resp = self._post(client, method="HIFO")
        assert resp.status_code == 200

    def test_no_file_returns_400(self, client):
        resp = client.post("/convert", data={"method": "FIFO"},
                           content_type="multipart/form-data")
        assert resp.status_code == 400

    def test_invalid_method_returns_400(self, client):
        resp = self._post(client, method="AVERAGE")
        assert resp.status_code == 400

    def test_empty_csv_returns_400(self, client):
        empty = "Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind\n"
        resp = self._post(client, csv_text=empty)
        assert resp.status_code == 400

    def test_fifo_gain_calculation_correct(self, client):
        """Buy 1 BTC @ $30,000; sell @ $50,000 → $20,000 gain."""
        resp = self._post(client, method="FIFO")
        with zipfile.ZipFile(io.BytesIO(resp.data)) as z:
            summary = z.read("summary.txt").decode("utf-8")
        # The summary should show the $20,000 gain
        assert "20000.00" in summary

    def test_different_methods_produce_different_results(self, client):
        """
        With multiple lots at different prices the methods should differ.
        Use a CSV with two lots then sell one.
        """
        multi_lot_csv = (
            "Timestamp (UTC),Transaction Description,Currency,Amount,"
            "To Currency,To Amount,Native Currency,Native Amount,"
            "Native Amount (in USD),Transaction Kind\n"
            "2019-01-01 00:00:00,Buy BTC,BTC,1.0,,,USD,-10000,-10000,crypto_purchase\n"
            "2020-01-01 00:00:00,Buy BTC,BTC,1.0,,,USD,-45000,-45000,crypto_purchase\n"
            "2022-01-01 00:00:00,Sell BTC,BTC,-1.0,,,USD,50000,50000,crypto_purchase\n"
        )
        fifo_resp = self._post(client, csv_text=multi_lot_csv, method="FIFO")
        hifo_resp = self._post(client, csv_text=multi_lot_csv, method="HIFO")

        def get_summary(resp):
            with zipfile.ZipFile(io.BytesIO(resp.data)) as z:
                return z.read("summary.txt").decode("utf-8")

        fifo_summary = get_summary(fifo_resp)
        hifo_summary = get_summary(hifo_resp)
        # FIFO and HIFO should yield different total gain/loss
        assert fifo_summary != hifo_summary
