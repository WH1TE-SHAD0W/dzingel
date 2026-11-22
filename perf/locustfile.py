"""Locust load test for the džingel API (issue #21, NFR-01..03).

One synthetic user is registered (or logged in on 409) ONCE in test_start, belongs to the group
"Test Crew" and owns a few synthetic quotes. All simulated users reuse that session cookie, so the
rate-limited register/login endpoints (3 per 10 s per IP) are hit at most twice per run.
Quote text is synthetic and is never logged.
"""
import random

import requests
from locust import HttpUser, constant, events, task

USERNAME = "alex.dev"
PASSWORD = "synthetic-pass-1"
GROUP_NAME = "Test Crew"
KEYWORD = "synthetic"
SEED_COUNT = 5

# Filled by test_start, read by every user.
STATE = {"cookies": {}, "group": 0, "quote_ids": []}


def _ok(res, *codes):
    if res.status_code not in codes:
        raise RuntimeError(f"setup failed: {res.request.method} {res.url} -> {res.status_code}")
    return res


@events.test_start.add_listener
def seed(environment, **_kwargs):
    host = environment.host.rstrip("/")
    s = requests.Session()
    creds = {"username": USERNAME, "password": PASSWORD}
    res = s.post(f"{host}/api/auth/register", json=creds)
    if res.status_code == 409:
        res = s.post(f"{host}/api/auth/login", json=creds)
    _ok(res, 200, 201)

    groups = _ok(s.get(f"{host}/api/groups"), 200).json()
    group = next((g["id"] for g in groups if g["name"] == GROUP_NAME), None)
    if group is None:
        group = _ok(s.post(f"{host}/api/groups", json={"name": GROUP_NAME}), 201).json()["id"]

    ids = [q["id"] for q in _ok(s.get(f"{host}/api/quotes", params={"group": group}), 200).json()]
    for i in range(max(0, SEED_COUNT - len(ids))):
        body = {"group_id": group, "text": f"{KEYWORD} quote {i + 1}", "context": "synthetic context"}
        ids.append(_ok(s.post(f"{host}/api/quotes", json=body), 201).json()["id"])

    STATE.update(cookies=s.cookies.get_dict(), group=group, quote_ids=ids)


class QuoteUser(HttpUser):
    # 50 users x 1 request/s = about 50 req/s.
    wait_time = constant(1)

    def on_start(self):
        for name, value in STATE["cookies"].items():
            self.client.cookies.set(name, value)

    @task(65)
    def search(self):
        self.client.get("/api/quotes", params={"group": STATE["group"], "q": KEYWORD},
                        name="GET /api/quotes?q")

    @task(20)
    def read(self):
        qid = random.choice(STATE["quote_ids"])
        self.client.get(f"/api/quotes/{qid}", name="GET /api/quotes/:id")

    @task(10)
    def create(self):
        n = random.randint(1, 1_000_000)
        with self.client.post("/api/quotes",
                              json={"group_id": STATE["group"], "text": f"{KEYWORD} load quote {n}"},
                              name="POST /api/quotes", catch_response=True) as res:
            if res.status_code == 201:
                STATE["quote_ids"].append(res.json()["id"])
                res.success()
            else:
                res.failure(f"status {res.status_code}")

    @task(5)
    def groups(self):
        self.client.get("/api/groups", name="GET /api/groups")
