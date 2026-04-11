"""Pytest configuration and shared fixtures."""

import sys, os
# Ensure the crypto_tax package root is on the path when running from any CWD.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from app import app as flask_app


@pytest.fixture
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as c:
        yield c


SAMPLE_CSV = """\
Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind
2021-01-01 00:00:00,Buy BTC,BTC,1.0,,,USD,-30000,-30000,crypto_purchase
2022-06-01 00:00:00,Sell BTC,BTC,-1.0,,,USD,50000,50000,crypto_purchase
2021-07-01 00:00:00,Earn Interest,CRO,500.0,,,USD,50,50,crypto_earn_interest_paid
"""
