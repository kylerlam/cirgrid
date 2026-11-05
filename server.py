"""Single-account CirGrid HTTP server using only the Python standard library."""

from collections import defaultdict
from contextlib import closing
from datetime import date
from hashlib import pbkdf2_hmac, sha256
from hmac import compare_digest
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import sqlite3
import tempfile
import threading
import time
from urllib.parse import parse_qs, unquote, urlsplit

from cirgrid_data import DECODER, MAX_IMPORT_BYTES, MAX_STATE_BYTES, dump_yaml, migrate_state, read_backup, validate_state


ROOT = Path(__file__).resolve().parent
COOKIE = "cirgrid_session"
DEFAULT_USERNAME = "admin"
DEFAULT_PASSWORD = "admin123"
SESSION_SECONDS = 30 * 24 * 60 * 60
LOGIN_WINDOW = 300
LOGIN_ATTEMPTS = 10


class RequestError(Exception):
    def __init__(self, error, message, status=400):
        super().__init__(message)
        self.error = error
        self.status = status


def unauthorized():
    return RequestError("UNAUTHORIZED", "Sign in to continue.", 401)


def token_hash(token):
    return sha256(token.encode()).hexdigest()


def password_hash(password, salt):
    return pbkdf2_hmac("sha256", password.encode(), salt, 600_000)


def credential(value, label, minimum, maximum):
    if isinstance(value, str):
        try:
            if minimum <= len(value.encode("utf-16-le")) // 2 <= maximum:
                return value
        except UnicodeEncodeError:
            pass
    raise RequestError(f"INVALID_{label}", "The account field has an invalid length or type.")


def username_value(value):
    username = credential(value, "USERNAME", 2, 64)
    if username != username.strip() or re.search(r"[\x00-\x1f\x7f-\x9f]", username):
        raise RequestError("INVALID_USERNAME", "Use a username without control characters or outer spaces.")
    return username


class Store:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / "cirgrid.sqlite3"
        self.export_lock = threading.Lock()
        with closing(self.connect()) as db, db:
            deadline = time.monotonic() + 15
            while True:
                try:
                    db.execute("PRAGMA journal_mode = WAL")
                    break
                except sqlite3.OperationalError as error:
                    if error.sqlite_errorcode != sqlite3.SQLITE_BUSY or time.monotonic() >= deadline:
                        raise
                    time.sleep(0.05)
            db.execute("BEGIN IMMEDIATE")
            db.execute("""CREATE TABLE IF NOT EXISTS account (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    username TEXT NOT NULL, salt BLOB NOT NULL, password BLOB NOT NULL,
                    password_changed INTEGER NOT NULL DEFAULT 0
                )""")
            db.execute("""CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY, expires INTEGER NOT NULL
                )""")
            db.execute("""CREATE TABLE IF NOT EXISTS tracker (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    revision INTEGER NOT NULL, state TEXT NOT NULL
                )""")
            columns = {row[1] for row in db.execute("PRAGMA table_info(account)")}
            if "password_changed" not in columns:
                db.execute("ALTER TABLE account ADD COLUMN password_changed INTEGER NOT NULL DEFAULT 0")
                account = db.execute("SELECT salt, password FROM account WHERE id = 1").fetchone()
                if account and not compare_digest(password_hash(DEFAULT_PASSWORD, account[0]), account[1]):
                    db.execute("UPDATE account SET password_changed = 1 WHERE id = 1")
            if db.execute("SELECT 1 FROM account WHERE id = 1").fetchone() is None:
                salt = secrets.token_bytes(16)
                db.execute("INSERT INTO account (id, username, salt, password) VALUES (1, ?, ?, ?)",
                           (DEFAULT_USERNAME, salt, password_hash(DEFAULT_PASSWORD, salt)))
            tracker = db.execute("SELECT state FROM tracker WHERE id = 1").fetchone()
            if tracker:
                previous = json.loads(tracker[0])
                state = migrate_state(previous)
                if state is not previous:
                    db.execute("UPDATE tracker SET revision = revision + 1, state = ? WHERE id = 1",
                               (json.dumps(state, ensure_ascii=False, separators=(",", ":")),))

    def connect(self):
        return sqlite3.connect(self.path, timeout=15)

    def default_credentials(self):
        with closing(self.connect()) as db:
            account = db.execute("SELECT username, password_changed FROM account WHERE id = 1").fetchone()
            return {"username": account[0], "password": DEFAULT_PASSWORD} if not account[1] else None

    def new_session(self, db):
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        db.execute("DELETE FROM sessions WHERE expires <= ?", (now,))
        db.execute("INSERT INTO sessions VALUES (?, ?)", (token_hash(token), now + SESSION_SECONDS))
        return token

    def session_user(self, token):
        if token is None:
            return None
        with closing(self.connect()) as db:
            row = db.execute("""SELECT username FROM account
                WHERE EXISTS (SELECT 1 FROM sessions WHERE token = ? AND expires > ?)""",
                (token_hash(token), int(time.time()))).fetchone()
            return row[0] if row else None

    def login(self, data):
        username = credential(data.get("username"), "USERNAME", 0, 64)
        password = credential(data.get("password"), "PASSWORD", 0, 256)
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            account = db.execute("SELECT username, salt, password FROM account").fetchone()
            valid_password = compare_digest(password_hash(password, account[1]), account[2])
            if not compare_digest(username.encode(), account[0].encode()) or not valid_password:
                raise RequestError("INVALID_CREDENTIALS", "Invalid username or password.", 401)
            return account[0], self.new_session(db)

    def logout(self, token):
        if token is not None:
            with closing(self.connect()) as db, db:
                db.execute("DELETE FROM sessions WHERE token = ?", (token_hash(token),))

    def change_account(self, token, data):
        username = username_value(data.get("username"))
        current = credential(data.get("currentPassword"), "CURRENT_PASSWORD", 0, 256)
        password = data.get("password", "")
        if password != "":
            password = credential(password, "PASSWORD", 12, 256)
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            active = db.execute("SELECT 1 FROM sessions WHERE token = ? AND expires > ?",
                                (token_hash(token), int(time.time()))).fetchone()
            if not active:
                raise unauthorized()
            _, salt, digest = db.execute("SELECT username, salt, password FROM account").fetchone()
            if not compare_digest(password_hash(current, salt), digest):
                raise RequestError("INVALID_CURRENT_PASSWORD", "The current password is incorrect.")
            changed = bool(password) and not compare_digest(password.encode(), current.encode())
            if changed:
                salt = secrets.token_bytes(16)
                digest = password_hash(password, salt)
            db.execute("""UPDATE account SET username = ?, salt = ?, password = ?,
                       password_changed = CASE WHEN ? THEN 1 ELSE password_changed END WHERE id = 1""",
                       (username, salt, digest, changed))
            db.execute("DELETE FROM sessions")
            return username, self.new_session(db)

    def read_state(self):
        with closing(self.connect()) as db:
            row = db.execute("SELECT revision, state FROM tracker WHERE id = 1").fetchone()
            return {"state": json.loads(row[1]), "revision": row[0]} if row else {"state": None, "revision": 0}

    def save_state(self, data):
        state = data.get("state")
        revision = data.get("revision")
        if type(revision) is not int or not 0 <= revision < 2 ** 53 - 1:
            raise RequestError("INVALID_REVISION", "The revision is invalid.")
        try:
            validate_state(state)
        except ValueError as error:
            raise RequestError("INVALID_STATE", str(error)) from None
        encoded = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode()) > MAX_STATE_BYTES:
            raise RequestError("STATE_TOO_LARGE", "The tracker has exceeded its storage limit.", 413)
        with closing(self.connect()) as db, db:
            if revision == 0:
                result = db.execute("INSERT OR IGNORE INTO tracker VALUES (1, 1, ?)", (encoded,))
            else:
                result = db.execute("UPDATE tracker SET revision = revision + 1, state = ? "
                                    "WHERE id = 1 AND revision = ?", (encoded, revision))
            if result.rowcount == 0:
                raise RequestError("STATE_CONFLICT", "Data changed on another device. Try again.", 409)
        return {"state": state, "revision": revision + 1}

    def export(self, file_format):
        with self.export_lock:
            state = self.read_state()["state"]
            if state is None:
                state = {"version": 3, "habits": [], "completions": {}}
            payload = {"format": "cirgrid-export", "state": state}
            yaml = dump_yaml(payload).encode()
            # A completed download and the server snapshot describe the same revision.
            with tempfile.NamedTemporaryFile(dir=self.directory, delete=False) as stream:
                temporary = Path(stream.name)
                try:
                    stream.write(yaml)
                    stream.close()
                    temporary.replace(self.directory / "cirgrid.yml")
                finally:
                    temporary.unlink(missing_ok=True)
        if file_format == "json":
            return json.dumps(payload, ensure_ascii=False, indent=2).encode() + b"\n"
        return yaml


def session_data(username=None):
    value = {"authenticated": username is not None, "needsSetup": False}
    if username is not None:
        value["username"] = username
    return value


def make_server(host, port, store, *, secure_cookie=False):
    attempts = defaultdict(int)
    attempts_lock = threading.Lock()
    window = None

    class Handler(BaseHTTPRequestHandler):
        server_version = "CirGrid"
        sys_version = ""
        timeout = 15

        def reply(self, content, content_type="application/json; charset=utf-8", status=200, **headers):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "same-origin")
            self.send_header("Content-Security-Policy",
                             "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                             "base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
            for name, value in headers.items():
                self.send_header(name.replace("_", "-"), value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(content)

        def json(self, value, status=200, **headers):
            self.reply(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode(), status=status, **headers)

        def body(self, limit=4096):
            self.require_same_origin()
            if self.headers.get_content_type() != "application/json":
                raise RequestError("INVALID_CONTENT_TYPE", "Send an application/json request.", 415)
            try:
                size = int(self.headers.get("Content-Length", ""))
            except ValueError:
                raise RequestError("INVALID_LENGTH", "Invalid request length.") from None
            if size < 0 or size > limit:
                raise RequestError("REQUEST_TOO_LARGE", "The request is too large.", 413)
            try:
                result = DECODER.decode(self.rfile.read(size).decode())
            except (ValueError, RecursionError):
                raise RequestError("INVALID_JSON", "Send a valid JSON object.") from None
            if not isinstance(result, dict):
                raise RequestError("INVALID_JSON", "Send a JSON object.")
            return result

        def require_same_origin(self):
            origin = self.headers.get("Origin")
            fetch_site = self.headers.get("Sec-Fetch-Site")
            try:
                scheme = "https" if secure_cookie else "http"
                expected = urlsplit(f"{scheme}://{self.headers.get('Host', '')}")
                supplied = urlsplit(origin) if origin is not None else expected
                default_port = 443 if scheme == "https" else 80
                same_origin = (
                    expected.hostname and supplied.scheme == scheme and supplied.hostname == expected.hostname
                    and (supplied.port or default_port) == (expected.port or default_port)
                    and not (supplied.path or supplied.query or supplied.fragment or supplied.username is not None)
                )
            except ValueError:
                same_origin = False
            if fetch_site not in (None, "same-origin") or not same_origin:
                raise RequestError("INVALID_ORIGIN", "This request must come from CirGrid.", 403)

        def request_token(self):
            cookie = SimpleCookie()
            try:
                cookie.load(self.headers.get("Cookie", ""))
            except CookieError:
                return None
            token = cookie[COOKIE].value if COOKIE in cookie else ""
            return token if re.fullmatch(r"[A-Za-z0-9_-]{43}", token) else None

        def set_cookie(self, token):
            cookie = SimpleCookie()
            cookie[COOKIE] = token or ""
            options = cookie[COOKIE]
            options["path"] = "/"
            options["httponly"] = True
            options["samesite"] = "Strict"
            options["max-age"] = SESSION_SECONDS if token else 0
            options["secure"] = secure_cookie
            return options.OutputString()

        def limit_sign_in(self):
            nonlocal window
            now = int(time.monotonic()) // LOGIN_WINDOW
            client = self.client_address[0]
            with attempts_lock:
                if now != window:
                    attempts.clear()
                    window = now
                if attempts[client] >= LOGIN_ATTEMPTS:
                    raise RequestError("RATE_LIMITED", "Too many attempts. Try again in a few minutes.", 429)
                attempts[client] += 1

        def api(self, path, query, token, username):
            method = "GET" if self.command == "HEAD" else self.command
            if method == "GET":
                if path == "/api/health":
                    return self.json({"ok": True})
                if path == "/api/session":
                    data = session_data(username)
                    credentials = store.default_credentials()
                    if credentials is not None:
                        data["defaultCredentials"] = credentials
                    return self.json(data)
            if method == "POST":
                if path == "/api/login":
                    data = self.body()
                    self.limit_sign_in()
                    user, new_token = store.login(data)
                    return self.json(session_data(user), Set_Cookie=self.set_cookie(new_token))
                if path == "/api/logout":
                    self.body()
                    store.logout(token)
                    return self.json({}, Set_Cookie=self.set_cookie(None))
            if username is None:
                raise unauthorized()
            if method == "GET" and path == "/api/state":
                return self.json(store.read_state())
            if method == "PUT" and path == "/api/state":
                return self.json(store.save_state(self.body(MAX_IMPORT_BYTES)))
            if method == "POST" and path == "/api/account":
                user, new_token = store.change_account(token, self.body())
                return self.json(session_data(user), Set_Cookie=self.set_cookie(new_token))
            if method == "POST" and path == "/api/import":
                return self.parse_import()
            if method == "GET" and path == "/api/export":
                return self.download_export(query)
            raise RequestError("NOT_FOUND", "The endpoint was not found.", 404)

        def parse_import(self):
            data = self.body(MAX_IMPORT_BYTES * 2 + 1024)
            content = data.get("text")
            file_format = data.get("format")
            try:
                if not isinstance(content, str) or file_format not in ("json", "yaml", "yml"):
                    raise ValueError("Choose a CirGrid JSON or YAML export.")
                if len(content.encode()) > MAX_IMPORT_BYTES:
                    raise RequestError("IMPORT_TOO_LARGE", "Choose a file smaller than 10 MiB.", 413)
                state = read_backup(content, file_format)
            except (ValueError, RecursionError):
                raise RequestError("INVALID_IMPORT", "Choose a valid CirGrid export.") from None
            return self.json({"state": state})

        def download_export(self, query):
            self.require_same_origin()
            formats = parse_qs(query, keep_blank_values=True)
            values = formats.get("format", ["yaml"])
            if formats.keys() - {"format"} or len(values) != 1 or values[0] not in ("json", "yaml", "yml"):
                raise RequestError("INVALID_FORMAT", "Choose JSON or YAML for the export.")
            file_format = values[0]
            if self.command == "HEAD":
                raise RequestError("METHOD_NOT_ALLOWED", "Use GET to download an export.", 405)
            extension = "json" if file_format == "json" else "yml"
            content_type = "application/json" if extension == "json" else "application/yaml"
            return self.reply(store.export(file_format), content_type + "; charset=utf-8",
                              Content_Disposition=f'attachment; filename="cirgrid-{date.today()}.{extension}"')

        def static(self, path, username):
            if path in ("/", "/index.html", "/login", "/login.html"):
                login = path in ("/login", "/login.html")
                if not login and username is None:
                    return self.reply(b"", status=302, Location="/login")
                if login and username is not None:
                    return self.reply(b"", status=302, Location="/")
                target = ROOT / ("login.html" if login else "index.html")
            else:
                parts = path.removeprefix("/").split("/")
                if len(parts) < 2 or parts[0] not in ("src", "assets") or any(
                    not part or part.startswith(".") for part in parts
                ):
                    raise RequestError("NOT_FOUND", "The file was not found.", 404)
                target = ROOT.joinpath(*parts).resolve()
                if not target.is_relative_to(ROOT / parts[0]) or target.suffix not in (
                    ".js", ".mjs", ".css", ".svg", ".png", ".ico", ".webp"
                ):
                    raise RequestError("NOT_FOUND", "The file was not found.", 404)
            if not target.is_file():
                raise RequestError("NOT_FOUND", "The file was not found.", 404)
            kind = mimetypes.guess_type(target)[0] or "application/octet-stream"
            if kind.startswith("text/") or kind in ("application/javascript", "image/svg+xml"):
                kind += "; charset=utf-8"
            return self.reply(target.read_bytes(), kind)

        def handle_request(self):
            try:
                try:
                    url = urlsplit(self.path)
                    path = unquote(url.path, errors="strict")
                except ValueError:
                    raise RequestError("INVALID_PATH", "Invalid request path.") from None
                if "\x00" in path:
                    raise RequestError("INVALID_PATH", "Invalid request path.")
                token = self.request_token()
                username = store.session_user(token)
                if path.startswith("/api/"):
                    return self.api(path, url.query, token, username)
                if self.command in ("GET", "HEAD"):
                    return self.static(path, username)
                raise RequestError("METHOD_NOT_ALLOWED", "This method is not allowed.", 405)
            except RequestError as error:
                return self.json({"error": error.error, "message": str(error)}, error.status)
            except (BrokenPipeError, ConnectionResetError):
                return
            except (sqlite3.Error, OSError):
                return self.json({"error": "STORAGE_ERROR", "message": "Unable to read or save data."}, 500)

        do_GET = do_HEAD = do_POST = do_PUT = handle_request

    return ThreadingHTTPServer((host, port), Handler)


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "4173"))
    secure = os.environ.get("SESSION_COOKIE_SECURE", "false").lower()
    if secure not in ("true", "false", "1", "0", ""):
        raise SystemExit("SESSION_COOKIE_SECURE must be true or false.")
    store = Store(os.environ.get("DATA_DIR", ROOT / "data"))
    with make_server(host, port, store, secure_cookie=secure in ("true", "1")) as server:
        print(f"CirGrid is running at http://{host}:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
