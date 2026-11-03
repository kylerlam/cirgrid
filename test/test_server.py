"""Exercise the real CirGrid routes with a temporary SQLite database."""

from http.client import HTTPConnection
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest

from server import Store, make_server


STATE = {
    "version": 2,
    "habits": [{
        "id": "reading", "name": "Read 📘", "color": "#123456",
        "weeklyGoals": {"0001-01-01": 5, "2026-11-02": 3},
        "endDate": "2026-12-31", "stageGoal": "Read 3 → 5 books",
    }],
    "completions": {"2026-11-01": {"reading": "late"}},
}
ACCOUNT = {"username": "owner", "password": "testing-password-1"}
SETUP_TOKEN = "integration-setup-token"


class ServerTest(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        self.start()

    def start(self):
        server = make_server("127.0.0.1", 0, Store(self.directory), setup_token=SETUP_TOKEN)
        self.addCleanup(server.server_close)
        worker = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
        worker.start()
        self.addCleanup(worker.join)
        self.addCleanup(server.shutdown)
        self.port = server.server_port
        self.origin = f"http://127.0.0.1:{self.port}"
        return server

    def request(self, method, path, data=None, *, cookie=None, headers=None):
        fields = {"Origin": self.origin, "Sec-Fetch-Site": "same-origin"}
        if data is not None:
            fields["Content-Type"] = "application/json"
        if cookie:
            fields["Cookie"] = cookie
        fields.update(headers or {})
        connection = HTTPConnection("127.0.0.1", self.port, timeout=4)
        try:
            connection.request(method, path, json.dumps(data) if data is not None else None, fields)
            response = connection.getresponse()
            content = response.read()
            if response.status != 302 and response.getheader("Content-Type", "").startswith("application/json"):
                content = json.loads(content)
            return response.status, response.headers, content
        finally:
            connection.close()

    def setup_account(self):
        status, headers, data = self.request("POST", "/api/setup", ACCOUNT | {"setupToken": SETUP_TOKEN})
        self.assertEqual(status, 200)
        self.assertEqual(data, {"authenticated": True, "needsSetup": False, "username": "owner"})
        cookie = headers["Set-Cookie"]
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        return cookie.split(";", 1)[0]

    def test_single_account_and_session_lifecycle(self):
        self.assertEqual(self.request("GET", "/")[0], 302)
        self.assertEqual(self.request("GET", "/api/state")[0], 401)
        self.assertEqual(self.request("GET", "/api/session")[2],
                         {"authenticated": False, "needsSetup": True, "setupTokenRequired": True})
        self.assertEqual(self.request("POST", "/api/setup", ACCOUNT)[0], 403)
        self.assertEqual(self.request("POST", "/api/setup", ACCOUNT | {"setupToken": SETUP_TOKEN},
                                      headers={"Origin": "https://another.example"})[0], 403)
        cookie = self.setup_account()
        self.assertEqual(self.request("POST", "/api/setup", ACCOUNT | {"setupToken": SETUP_TOKEN})[0], 409)
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie)[2], {"state": None, "revision": 0})
        self.assertEqual(self.request("GET", "/data/cirgrid.sqlite3", cookie=cookie)[0], 404)
        status, headers, _ = self.request("POST", "/api/login", ACCOUNT)
        self.assertEqual(status, 200)
        other_cookie = headers["Set-Cookie"].split(";", 1)[0]
        status, headers, body = self.request("POST", "/api/account", {
            "username": "renamed", "currentPassword": ACCOUNT["password"], "password": "a-different-password",
        }, cookie=cookie)
        self.assertEqual((status, body["username"]), (200, "renamed"))
        self.assertEqual(self.request("GET", "/api/state", cookie=other_cookie)[0], 401)
        self.assertEqual(self.request("POST", "/api/login", ACCOUNT)[0], 401)
        cookie = headers["Set-Cookie"].split(";", 1)[0]
        self.assertEqual(self.request("POST", "/api/logout", {}, cookie=cookie)[0], 200)
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie)[0], 401)

    def test_revision_backup_and_legacy_import(self):
        cookie = self.setup_account()
        status, _, backup = self.request("GET", "/api/export?format=json", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual([habit["id"] for habit in backup["state"]["habits"]], ["sunscreen", "exercise", "reading"])
        self.assertEqual(backup["state"]["completions"], {})
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie)[2], {"state": None, "revision": 0})
        self.assertEqual(self.request("GET", "/api/export", cookie=cookie,
                                      headers={"Sec-Fetch-Site": "same-site"})[0], 403)
        snapshot = {"state": STATE, "revision": 0}
        self.assertEqual(self.request("PUT", "/api/state", snapshot, cookie=cookie)[0], 200)
        self.assertEqual(self.request("PUT", "/api/state", snapshot, cookie=cookie)[0], 409)
        self.assertEqual(self.request("PUT", "/api/state", {"state": STATE | {"version": 1}, "revision": 1},
                                      cookie=cookie)[0], 400)

        # A fresh HTTP server uses the existing database and still recognizes the session.
        self.start()
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie)[2], {"state": STATE, "revision": 1})
        status, headers, yaml = self.request("GET", "/api/export", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertIn(".yml", headers["Content-Disposition"])
        self.assertEqual((self.directory / "cirgrid.yml").read_bytes(), yaml)
        status, _, backup = self.request("GET", "/api/export?format=json", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(backup, {"format": "cirgrid-export", "state": STATE})
        for file_format, content in (("yaml", yaml.decode()), ("json", json.dumps(backup))):
            self.assertEqual(self.request("POST", "/api/import", {"format": file_format, "text": content},
                                          cookie=cookie)[2], {"state": STATE})
        legacy = {"version": 1, "habits": [{"id": "reading", "name": "Read", "color": "blue"}],
                  "completions": {"2026-11-01": {"reading": True}}}
        self.assertEqual(self.request("POST", "/api/import", {"format": "json", "text": json.dumps(legacy)},
                                      cookie=cookie)[2], {"state": legacy})
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie)[2], {"state": STATE, "revision": 1})


if __name__ == "__main__":
    unittest.main()
