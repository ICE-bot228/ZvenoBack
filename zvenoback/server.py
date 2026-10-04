# server.py
# ZvenoBack v5.0 — финал: эмодзи + посты + комментарии + чаты + E2E
# Только стандартная библиотека! Python 3.13+

import http.server
import socketserver
import json
import sqlite3
import os
import sys
import re
import time
import io
import secrets
from urllib.parse import urlparse, parse_qs
from http.cookies import SimpleCookie

import crypto

# ═══════════════════════════════════════════════════════════
#  НАСТРОЙКИ
# ═══════════════════════════════════════════════════════════
PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "zvenoback.db")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
POSTS_DIR = os.path.join(UPLOADS_DIR, "posts")
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

OWNER_EMAIL = "vector_ice.2@bk.ru"
OWNER_USERNAME = "zvenoback"

RESERVED_USERNAMES = {
    "zvenoback":  OWNER_EMAIL, "admin": OWNER_EMAIL, "owner": OWNER_EMAIL,
    "support": OWNER_EMAIL, "team": OWNER_EMAIL, "vector": OWNER_EMAIL,
    "vector_ice": OWNER_EMAIL, "root": OWNER_EMAIL, "moderator": OWNER_EMAIL,
}

REGULAR_EMOJI = {
    "🐱","🐶","🦊","🐼","🐨","🐸","🦁","🐯","🐷","🐵",
    "🐔","🦄","🐙","🦋","🐢","🐠","🐳","🌸","🌈","⭐",
    "🔥","⚡","💎","🎯","🎮","🎸","🚀","🍕","🍔","🍩",
}
ELITE_EMOJI = {
    "😈","👑","🔱","💀","🤖","👽","🦾","👁","⚜","✨",
    "🛸","⚔","🔮","💠","🩸",
}
ALL_EMOJI = REGULAR_EMOJI | ELITE_EMOJI

MAX_POST_IMAGE = 10 * 1024 * 1024
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}

SESSIONS = {}
USER_KEYS = {}

for d in [UPLOADS_DIR, POSTS_DIR, STATIC_DIR, TEMPLATES_DIR]:
    os.makedirs(d, exist_ok=True)

# ═══════════════════════════════════════════════════════════
#  БАЗА
# ═══════════════════════════════════════════════════════════
def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        display TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        avatar TEXT,
        emoji TEXT DEFAULT '🐱',
        bio TEXT DEFAULT '',
        role TEXT DEFAULT 'user',
        verified INTEGER DEFAULT 0,
        banned INTEGER DEFAULT 0,
        banned_reason TEXT DEFAULT '',
        created_at REAL,
        last_seen REAL
    );
    CREATE TABLE IF NOT EXISTS public_keys (
        user_id INTEGER PRIMARY KEY,
        public_key TEXT NOT NULL,
        updated_at REAL
    );
    CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        text TEXT DEFAULT '',
        image TEXT,
        created_at REAL
    );
    CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        post_id INTEGER NOT NULL,
        created_at REAL,
        UNIQUE(user_id, post_id)
    );
    CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        created_at REAL
    );
    CREATE TABLE IF NOT EXISTS friendships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at REAL,
        UNIQUE(user_id, friend_id)
    );
    CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        name TEXT,
        description TEXT,
        emoji TEXT DEFAULT '💬',
        created_by INTEGER,
        created_at REAL
    );
    CREATE TABLE IF NOT EXISTS chat_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at REAL,
        UNIQUE(chat_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        from_id INTEGER NOT NULL,
        encrypted TEXT NOT NULL,
        reply_to INTEGER,
        read_at REAL,
        created_at REAL
    );
    CREATE TABLE IF NOT EXISTS admin_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        target_id INTEGER,
        details TEXT,
        created_at REAL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at);
    """)
    conn.commit()
    conn.close()

       # Миграции
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()

        # users.emoji
        cols = [r[1] for r in c.execute("PRAGMA table_info(users)").fetchall()]
        if "emoji" not in cols:
            c.execute("ALTER TABLE users ADD COLUMN emoji TEXT DEFAULT '🐱'")
            print("[migration] users.emoji добавлено")

        # chats.emoji
        cols = [r[1] for r in c.execute("PRAGMA table_info(chats)").fetchall()]
        if "emoji" not in cols:
            c.execute("ALTER TABLE chats ADD COLUMN emoji TEXT DEFAULT '💬'")
            print("[migration] chats.emoji добавлено")

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[migration] {e}")

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

# ═══════════════════════════════════════════════════════════
#  MULTIPART
# ═══════════════════════════════════════════════════════════
class FileItem:
    def __init__(self, filename, data):
        self.filename = filename
        self.data = data

def parse_multipart(body_bytes, boundary):
    fields = {}
    files = {}
    delimiter = b"--" + boundary.encode("utf-8")
    parts = body_bytes.split(delimiter)
    for part in parts:
        if not part or part.strip() == b"--" or part.strip() == b"":
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if b"\r\n\r\n" not in part:
            continue
        headers_raw, data = part.split(b"\r\n\r\n", 1)
        if data.endswith(b"\r\n"):
            data = data[:-2]
        headers = {}
        for line in headers_raw.decode("utf-8", errors="replace").split("\r\n"):
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        disposition = headers.get("content-disposition", "")
        if "form-data" not in disposition:
            continue
        name = None
        filename = None
        for match in re.finditer(r'(\w+)="([^"]*)"', disposition):
            key = match.group(1)
            val = match.group(2)
            if key == "name":
                name = val
            elif key == "filename":
                filename = val
        if not name:
            continue
        if filename:
            files[name] = FileItem(filename, data)
        else:
            fields[name] = data.decode("utf-8", errors="replace")
    return fields, files

# ═══════════════════════════════════════════════════════════
#  HTTP HANDLER
# ═══════════════════════════════════════════════════════════
class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        msg = fmt % args
        if "/api/" in msg:
            print(f"  → {msg}")

    def get_session_user(self):
        ch = self.headers.get("Cookie", "")
        if not ch:
            return None
        try:
            c = SimpleCookie()
            c.load(ch)
            if "session" in c:
                uid = SESSIONS.get(c["session"].value)
                if uid is None:
                    return None
                db = get_db()
                u = db.execute("SELECT banned FROM users WHERE id = ?", (uid,)).fetchone()
                db.close()
                if u and u["banned"]:
                    return None
                return uid
        except Exception:
            pass
        return None

    def get_user_by_id(self, uid):
        db = get_db()
        u = db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        db.close()
        return u

    def is_admin(self, uid=None):
        if uid is None:
            uid = self.get_session_user()
        if not uid:
            return False
        u = self.get_user_by_id(uid)
        return u and u["role"] in ("owner", "admin", "developer")

    def is_owner(self, uid=None):
        if uid is None:
            uid = self.get_session_user()
        if not uid:
            return False
        u = self.get_user_by_id(uid)
        return u and u["role"] == "owner"

    def log_admin_action(self, admin_id, action, target_id=None, details=""):
        db = get_db()
        db.execute("""INSERT INTO admin_log (admin_id, action, target_id, details, created_at)
                      VALUES (?, ?, ?, ?, ?)""",
                   (admin_id, action, target_id, details, time.time()))
        db.commit()
        db.close()

    def send_json(self, obj, status=200, cookie=None):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def send_html(self, html, status=200):
        data = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_file(self, path, content_type):
        try:
            with open(path, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            self.send_error(404)

    def redirect(self, url):
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()

    def read_body(self):
        ln = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(ln) if ln > 0 else b""

    def parse_json(self):
        try:
            return json.loads(self.read_body().decode("utf-8"))
        except Exception:
            return {}

    def parse_form(self):
        ct = self.headers.get("Content-Type", "")
        body = self.read_body()
        if "multipart/form-data" in ct:
            boundary = None
            for part in ct.split(";"):
                part = part.strip()
                if part.startswith("boundary="):
                    boundary = part[9:].strip('"')
                    break
            if not boundary:
                return {}, {}
            return parse_multipart(body, boundary)
        else:
            parsed = parse_qs(body.decode("utf-8"), keep_blank_values=True)
            return {k: v[0] for k, v in parsed.items()}, {}

    def save_uploaded_file(self, file_item, folder, allowed_ext, max_size=10*1024*1024):
        if not file_item or not file_item.filename:
            return None
        ext = os.path.splitext(file_item.filename)[1].lower()
        if ext not in allowed_ext:
            return None
        data = file_item.data
        if len(data) == 0 or len(data) > max_size:
            return None
        fname = secrets.token_hex(16) + ext
        path = os.path.join(folder, fname)
        try:
            with open(path, "wb") as f:
                f.write(data)
        except Exception:
            return None
        return fname

    def serve_template(self, name):
        path = os.path.join(TEMPLATES_DIR, name)
        if not os.path.exists(path):
            self.send_html(f"<h1>Шаблон {name} не найден</h1><p>Создай файл templates/{name}</p>", 404)
            return
        with open(path, "r", encoding="utf-8") as f:
            html = f.read()
        self.send_html(html)

    # ═══════════════════════════════════════════════════════════
    #  GET
    # ═══════════════════════════════════════════════════════════
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        if path.startswith("/static/"):
            self.serve_static(path[8:]); return
        if path.startswith("/uploads/"):
            self.serve_upload(path[9:]); return
        if path.startswith("/api/"):
            self.handle_api_get(path, parsed); return

        user = self.get_session_user()
        if path == "/":
            self.serve_template("index.html" if user else "landing.html")
        elif path == "/login":
            self.serve_template("login.html")
        elif path == "/register":
            self.serve_template("register.html")
        elif path == "/profile" or path.startswith("/u/"):
            self.serve_template("profile.html")
        elif path == "/friends":
            self.serve_template("friends.html")
        elif path == "/chats" or path == "/messages":
            self.serve_template("chats.html")
        elif path.startswith("/chat/"):
            self.serve_template("chat.html")
        elif path == "/settings":
            self.serve_template("settings.html")
        elif path == "/admin":
            if self.is_admin():
                self.serve_template("admin.html")
            else:
                self.redirect("/")
        elif path == "/logout":
            self.serve_template("logout.html")
        else:
            self.serve_template("404.html")

    def serve_static(self, fname):
        fname = fname.replace("..", "").replace("\\", "/")
        path = os.path.join(STATIC_DIR, fname)
        if not os.path.exists(path):
            self.send_error(404); return
        ext = os.path.splitext(fname)[1].lower()
        cts = {
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
        }
        self.send_file(path, cts.get(ext, "application/octet-stream"))

    def serve_upload(self, fname):
        fname = fname.replace("..", "").replace("\\", "/")
        path = os.path.join(UPLOADS_DIR, fname)
        if not os.path.exists(path):
            self.send_error(404); return
        ext = os.path.splitext(fname)[1].lower()
        cts = {
            ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
        }
        self.send_file(path, cts.get(ext, "application/octet-stream"))

    def handle_api_get(self, path, parsed):
        # ME
        if path == "/api/me":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "not logged in"}, 401); return
            u = self.get_user_by_id(me)
            self.send_json({"ok": True, "user": self.serialize_user(u, is_self=True)})
            return

        # CHECK USERNAME
        if path == "/api/check_username":
            qs = parse_qs(parsed.query)
            username = qs.get("u", [""])[0].strip().lower()
            if not username:
                self.send_json({"ok": True, "available": False, "reason": "Пустой"}); return
            if len(username) < 3 or len(username) > 20:
                self.send_json({"ok": True, "available": False, "reason": "3-20 символов"}); return
            if not re.match(r"^[a-zA-Z0-9_]+$", username):
                self.send_json({"ok": True, "available": False, "reason": "Буквы, цифры, _"}); return
            if username in RESERVED_USERNAMES:
                self.send_json({"ok": True, "available": False,
                                "reason": "Зарезервирован", "reserved": True}); return
            db = get_db()
            ex = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
            db.close()
            if ex:
                self.send_json({"ok": True, "available": False, "reason": "Занят"}); return
            self.send_json({"ok": True, "available": True})
            return

        # EMOJI LIST
        if path == "/api/emoji_list":
            me = self.get_session_user()
            is_admin = self.is_admin(me)
            self.send_json({
                "ok": True,
                "regular": sorted(REGULAR_EMOJI),
                "elite": sorted(ELITE_EMOJI) if is_admin else [],
                "can_use_elite": is_admin,
            })
            return

        # POSTS
        if path == "/api/posts":
            qs = parse_qs(parsed.query)
            user_id = qs.get("user_id", [None])[0]
            limit = min(int(qs.get("limit", ["20"])[0]), 50)
            offset = int(qs.get("offset", ["0"])[0])
            db = get_db()
            me = self.get_session_user()
            if user_id:
                rows = db.execute("""
                    SELECT p.*, u.username, u.display, u.avatar, u.emoji, u.verified, u.role
                    FROM posts p JOIN users u ON u.id = p.user_id
                    WHERE p.user_id = ?
                    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
                """, (int(user_id), limit, offset)).fetchall()
            else:
                rows = db.execute("""
                    SELECT p.*, u.username, u.display, u.avatar, u.emoji, u.verified, u.role
                    FROM posts p JOIN users u ON u.id = p.user_id
                    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
                """, (limit, offset)).fetchall()
            posts = [self.serialize_post(db, r, me) for r in rows]
            db.close()
            self.send_json({"ok": True, "posts": posts})
            return

        # ═══ ОДИН ПОСТ С КОММЕНТАМИ ═══
        if path.startswith("/api/post/") and path != "/api/post":
            try:
                post_id = int(path.split("/")[-1])
            except ValueError:
                self.send_json({"ok": False, "error": "bad id"}, 400); return
            db = get_db()
            me = self.get_session_user()

            row = db.execute("""
                SELECT p.*, u.username, u.display, u.avatar, u.emoji, u.verified, u.role
                FROM posts p JOIN users u ON u.id = p.user_id
                WHERE p.id = ?
            """, (post_id,)).fetchone()

            if not row:
                db.close()
                self.send_json({"ok": False, "error": "not found"}, 404); return

            post = self.serialize_post(db, row, me)

            comments = db.execute("""
                SELECT c.id, c.text, c.created_at,
                       u.id as user_id, u.username, u.display,
                       u.avatar, u.emoji, u.verified
                FROM comments c JOIN users u ON u.id = c.user_id
                WHERE c.post_id = ?
                ORDER BY c.created_at ASC
            """, (post_id,)).fetchall()

            post["comments"] = [{
                "id": c["id"],
                "user_id": c["user_id"],
                "username": c["username"],
                "display": c["display"],
                "avatar": c["avatar"],
                "emoji": c["emoji"] or "🐱",
                "verified": bool(c["verified"]),
                "text": c["text"],
                "created_at": c["created_at"],
            } for c in comments]

            db.close()
            self.send_json({"ok": True, "post": post})
            return

        # CHATS
        if path == "/api/chats":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "not logged in"}, 401); return
            db = get_db()
            chats = db.execute("""
                SELECT c.* FROM chats c
                JOIN chat_members cm ON cm.chat_id = c.id
                WHERE cm.user_id = ?
                ORDER BY c.created_at DESC
            """, (me,)).fetchall()
            result = []
            for c in chats:
                last_msg = db.execute("""
                    SELECT m.*, u.username, u.display FROM messages m
                    JOIN users u ON u.id = m.from_id
                    WHERE m.chat_id = ? ORDER BY m.created_at DESC LIMIT 1
                """, (c["id"],)).fetchone()
                chat_name = c["name"]; chat_emoji = c["emoji"] or "💬"
                other_user = None
                if c["type"] == "private":
                    other = db.execute("""
                        SELECT u.id, u.username, u.display, u.avatar, u.emoji, u.verified, u.last_seen
                        FROM users u JOIN chat_members cm ON cm.user_id = u.id
                        WHERE cm.chat_id = ? AND u.id != ? LIMIT 1
                    """, (c["id"], me)).fetchone()
                    if other:
                        chat_name = other["display"]
                        chat_emoji = other["emoji"] or "🐱"
                        other_user = {
                            "id": other["id"], "username": other["username"],
                            "display": other["display"], "avatar": other["avatar"],
                            "emoji": other["emoji"], "verified": other["verified"],
                            "online": (time.time() - (other["last_seen"] or 0)) < 300,
                        }
                unread = db.execute("""
                    SELECT COUNT(*) c FROM messages
                    WHERE chat_id = ? AND from_id != ? AND read_at IS NULL
                """, (c["id"], me)).fetchone()["c"]
                members_count = db.execute("SELECT COUNT(*) c FROM chat_members WHERE chat_id = ?",
                                             (c["id"],)).fetchone()["c"]
                result.append({
                    "id": c["id"], "type": c["type"], "name": chat_name,
                    "emoji": chat_emoji,
                    "description": c["description"],
                    "unread": unread, "members_count": members_count,
                    "other_user": other_user,
                    "last_message": {
                        "from_username": last_msg["display"] if last_msg else None,
                        "created_at": last_msg["created_at"] if last_msg else None,
                    } if last_msg else None,
                })
            db.close()
            self.send_json({"ok": True, "chats": result})
            return

        # CHAT INFO
        if path.startswith("/api/chat/") and path.count("/") == 3:
            try:
                chat_id = int(path.split("/")[-1])
            except ValueError:
                self.send_json({"ok": False, "error": "bad id"}, 400); return
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "not logged in"}, 401); return
            db = get_db()
            member = db.execute("""SELECT * FROM chat_members
                                    WHERE chat_id = ? AND user_id = ?""",
                                 (chat_id, me)).fetchone()
            if not member:
                db.close()
                self.send_json({"ok": False, "error": "not a member"}, 403); return
            chat = db.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
            members = db.execute("""
                SELECT u.id, u.username, u.display, u.avatar, u.emoji, u.last_seen, u.verified, cm.role
                FROM users u JOIN chat_members cm ON cm.user_id = u.id
                WHERE cm.chat_id = ?
            """, (chat_id,)).fetchall()
            chat_data = {
                "id": chat["id"], "type": chat["type"],
                "name": chat["name"], "emoji": chat["emoji"] or "💬",
                "description": chat["description"],
                "my_role": member["role"],
                "members": [{
                    "id": m["id"], "username": m["username"], "display": m["display"],
                    "avatar": m["avatar"], "emoji": m["emoji"], "role": m["role"],
                    "verified": m["verified"],
                    "online": (time.time() - (m["last_seen"] or 0)) < 300,
                } for m in members],
            }
            if chat["type"] == "private":
                other = next((m for m in chat_data["members"] if m["id"] != me), None)
                if other:
                    chat_data["name"] = other["display"]
                    chat_data["emoji"] = other["emoji"] or "🐱"
                    chat_data["other_user"] = other
            db.close()
            self.send_json({"ok": True, "chat": chat_data})
            return

        # CHAT MESSAGES
        if path.startswith("/api/chat/") and path.endswith("/messages"):
            parts = path.split("/")
            try:
                chat_id = int(parts[3])
            except (ValueError, IndexError):
                self.send_json({"ok": False, "error": "bad id"}, 400); return
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "not logged in"}, 401); return
            db = get_db()
            member = db.execute("""SELECT * FROM chat_members
                                    WHERE chat_id = ? AND user_id = ?""",
                                 (chat_id, me)).fetchone()
            if not member:
                db.close()
                self.send_json({"ok": False, "error": "not a member"}, 403); return
            qs = parse_qs(parsed.query)
            limit = min(int(qs.get("limit", ["50"])[0]), 100)
            msgs = db.execute("""
                SELECT m.*, u.username, u.display, u.avatar, u.emoji, u.verified
                FROM messages m JOIN users u ON u.id = m.from_id
                WHERE m.chat_id = ?
                ORDER BY m.created_at DESC LIMIT ?
            """, (chat_id, limit)).fetchall()
            db.execute("""UPDATE messages SET read_at = ?
                          WHERE chat_id = ? AND from_id != ? AND read_at IS NULL""",
                       (time.time(), chat_id, me))
            db.commit()
            msgs_list = []
            for m in msgs:
                msgs_list.append({
                    "id": m["id"], "chat_id": m["chat_id"], "from_id": m["from_id"],
                    "username": m["username"], "display": m["display"],
                    "avatar": m["avatar"], "emoji": m["emoji"],
                    "verified": bool(m["verified"]),
                    "encrypted": m["encrypted"],
                    "reply_to": m["reply_to"],
                    "read_at": m["read_at"],
                    "created_at": m["created_at"],
                })
            msgs_list.reverse()
            db.close()
            self.send_json({"ok": True, "messages": msgs_list})
            return

        # PUBLIC KEY
        if path.startswith("/api/public_key/"):
            try:
                uid = int(path.split("/")[-1])
            except ValueError:
                self.send_json({"ok": False, "error": "bad id"}, 400); return
            db = get_db()
            row = db.execute("SELECT public_key FROM public_keys WHERE user_id = ?",
                              (uid,)).fetchone()
            db.close()
            if not row:
                self.send_json({"ok": False, "error": "no key"}, 404); return
            self.send_json({"ok": True, "public_key": row["public_key"]})
            return

        # FRIENDS
        if path == "/api/friends":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "not logged in"}, 401); return
            db = get_db()
            friends = db.execute("""
                SELECT u.id, u.username, u.display, u.avatar, u.emoji, u.bio, u.last_seen, u.verified
                FROM users u JOIN friendships f ON (
                    (f.user_id = ? AND f.friend_id = u.id) OR
                    (f.friend_id = ? AND f.user_id = u.id)
                ) WHERE f.status = 'accepted'
            """, (me, me)).fetchall()
            incoming = db.execute("""
                SELECT u.id, u.username, u.display, u.avatar, u.emoji, u.verified
                FROM users u JOIN friendships f ON f.user_id = u.id
                WHERE f.friend_id = ? AND f.status = 'pending'
            """, (me,)).fetchall()
            db.close()
            self.send_json({
                "ok": True,
                "friends": [dict(f) for f in friends],
                "incoming": [dict(i) for i in incoming],
            })
            return

        # USER
        if path.startswith("/api/user/"):
            try:
                uid = int(path.split("/")[-1])
            except ValueError:
                self.send_json({"ok": False, "error": "bad id"}, 400); return
            db = get_db()
            u = db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
            if not u:
                db.close()
                self.send_json({"ok": False, "error": "not found"}, 404); return
            posts_count = db.execute("SELECT COUNT(*) c FROM posts WHERE user_id = ?",
                                       (uid,)).fetchone()["c"]
            likes_rec = db.execute("""
                SELECT COUNT(*) c FROM likes l JOIN posts p ON p.id = l.post_id
                WHERE p.user_id = ?
            """, (uid,)).fetchone()["c"]
            friends_count = db.execute("""
                SELECT COUNT(*) c FROM friendships
                WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
            """, (uid, uid)).fetchone()["c"]
            db.close()
            me = self.get_session_user()
            is_self = (me == uid)
            ud = self.serialize_user(u, is_self=is_self, admin_view=self.is_admin())
            ud["posts_count"] = posts_count
            ud["likes_received"] = likes_rec
            ud["friends_count"] = friends_count
            self.send_json({"ok": True, "user": ud})
            return

        # SEARCH
        if path == "/api/search":
            qs = parse_qs(parsed.query)
            q = qs.get("q", [""])[0].strip()
            if not q:
                self.send_json({"ok": True, "users": []}); return
            db = get_db()
            users = db.execute("""
                SELECT id, username, display, avatar, emoji, bio, verified, role FROM users
                WHERE (username LIKE ? OR display LIKE ?) AND banned = 0 LIMIT 20
            """, (f"%{q}%", f"%{q}%")).fetchall()
            db.close()
            self.send_json({"ok": True, "users": [dict(u) for u in users]})
            return

        # NOTIFICATIONS
        if path == "/api/notifications":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": True, "unread_messages": 0, "friend_requests": 0}); return
            db = get_db()
            unread = db.execute("""
                SELECT COUNT(*) c FROM messages m
                JOIN chat_members cm ON cm.chat_id = m.chat_id
                WHERE cm.user_id = ? AND m.from_id != ? AND m.read_at IS NULL
            """, (me, me)).fetchone()["c"]
            reqs = db.execute("""
                SELECT COUNT(*) c FROM friendships WHERE friend_id = ? AND status = 'pending'
            """, (me,)).fetchone()["c"]
            db.close()
            self.send_json({"ok": True, "unread_messages": unread, "friend_requests": reqs})
            return

        # ADMIN: STATS
        if path == "/api/admin/stats":
            if not self.is_admin():
                self.send_json({"ok": False, "error": "Не админ"}, 403); return
            db = get_db()
            stats = {
                "users_total": db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"],
                "users_online": db.execute("SELECT COUNT(*) c FROM users WHERE last_seen > ?",
                                            (time.time() - 300,)).fetchone()["c"],
                "users_verified": db.execute("SELECT COUNT(*) c FROM users WHERE verified = 1").fetchone()["c"],
                "users_banned": db.execute("SELECT COUNT(*) c FROM users WHERE banned = 1").fetchone()["c"],
                "posts_total": db.execute("SELECT COUNT(*) c FROM posts").fetchone()["c"],
                "messages_total": db.execute("SELECT COUNT(*) c FROM messages").fetchone()["c"],
                "chats_total": db.execute("SELECT COUNT(*) c FROM chats").fetchone()["c"],
            }
            db.close()
            self.send_json({"ok": True, "stats": stats})
            return

        # ADMIN: USERS
        if path == "/api/admin/users":
            if not self.is_admin():
                self.send_json({"ok": False, "error": "Не админ"}, 403); return
            qs = parse_qs(parsed.query)
            q = qs.get("q", [""])[0].strip()
            limit = min(int(qs.get("limit", ["50"])[0]), 200)
            offset = int(qs.get("offset", ["0"])[0])
            db = get_db()
            if q:
                rows = db.execute("""
                    SELECT * FROM users
                    WHERE username LIKE ? OR display LIKE ? OR email LIKE ?
                    ORDER BY created_at DESC LIMIT ? OFFSET ?
                """, (f"%{q}%", f"%{q}%", f"%{q}%", limit, offset)).fetchall()
            else:
                rows = db.execute("""
                    SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?
                """, (limit, offset)).fetchall()
            users = [self.serialize_user(u, is_self=False, admin_view=True) for u in rows]
            db.close()
            self.send_json({"ok": True, "users": users})
            return

        # ADMIN: LOG
        if path == "/api/admin/log":
            if not self.is_owner():
                self.send_json({"ok": False, "error": "Только владелец"}, 403); return
            db = get_db()
            rows = db.execute("""
                SELECT l.*, u.username as admin_username, u.display as admin_display
                FROM admin_log l JOIN users u ON u.id = l.admin_id
                ORDER BY l.created_at DESC LIMIT 100
            """).fetchall()
            db.close()
            self.send_json({"ok": True, "log": [dict(r) for r in rows]})
            return

        self.send_json({"ok": False, "error": "unknown endpoint"}, 404)

    # ═══════════════════════════════════════════════════════════
    #  POST
    # ═══════════════════════════════════════════════════════════
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            self.send_error(404); return

        # REGISTER
        if path == "/api/register":
            fields, files = self.parse_form()
            username = fields.get("username", "").strip().lower()
            display = fields.get("display", "").strip()
            email_addr = fields.get("email", "").strip().lower()
            password = fields.get("password", "")
            emoji = fields.get("emoji", "🐱").strip() or "🐱"

            if not username or not email_addr or not password:
                self.send_json({"ok": False, "error": "Заполни все поля"}, 400); return
            if not display:
                display = username
            if len(display) > 40:
                display = display[:40]
            if len(username) < 3 or len(username) > 20:
                self.send_json({"ok": False, "error": "Логин 3-20 символов"}, 400); return
            if not re.match(r"^[a-zA-Z0-9_]+$", username):
                self.send_json({"ok": False, "error": "Логин: буквы, цифры, _"}, 400); return
            if username in RESERVED_USERNAMES:
                if RESERVED_USERNAMES[username].lower() != email_addr:
                    self.send_json({"ok": False,
                                    "error": f"Логин @{username} зарезервирован"}, 403); return
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_addr):
                self.send_json({"ok": False, "error": "Неверный email"}, 400); return
            if len(password) < 6:
                self.send_json({"ok": False, "error": "Пароль мин 6"}, 400); return

            if emoji not in REGULAR_EMOJI:
                emoji = "🐱"

            db = get_db()
            if db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
                db.close()
                self.send_json({"ok": False, "error": f"Логин @{username} занят"}, 400); return
            if db.execute("SELECT id FROM users WHERE LOWER(email) = ?", (email_addr,)).fetchone():
                db.close()
                self.send_json({"ok": False, "error": "Email используется"}, 400); return

            is_owner_email = (email_addr == OWNER_EMAIL)
            role = "owner" if is_owner_email else "user"
            verified = 1 if is_owner_email else 0
            bio = "Создатель ZvenoBack. Добро пожаловать! 😎" if is_owner_email else ""

            if is_owner_email:
                emoji = "👑"

            h, salt = crypto.hash_password(password)
            c = db.cursor()
            c.execute("""INSERT INTO users (username, display, email, password_hash, salt,
                          avatar, emoji, bio, role, verified, created_at, last_seen)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                      (username, display, email_addr, h, salt, None, emoji, bio,
                       role, verified, time.time(), time.time()))
            db.commit()
            uid = c.lastrowid

            priv_key, pub_key = crypto.generate_keypair()
            USER_KEYS[uid] = {"private": priv_key, "public": pub_key}
            db.execute("""INSERT INTO public_keys (user_id, public_key, updated_at)
                          VALUES (?, ?, ?)""",
                      (uid, str(pub_key), time.time()))
            db.commit()
            db.close()

            token = secrets.token_hex(32)
            SESSIONS[token] = uid
            cookie = f"session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"
            self.send_json({"ok": True, "user_id": uid, "is_owner": is_owner_email},
                           cookie=cookie)
            return

        # LOGIN
        if path == "/api/login":
            data = self.parse_json()
            ident = data.get("username", "").strip()
            password = data.get("password", "")
            if not ident or not password:
                self.send_json({"ok": False, "error": "Заполни все поля"}, 400); return

            db = get_db()
            u = db.execute("""SELECT * FROM users
                              WHERE LOWER(username) = ? OR LOWER(email) = ?""",
                            (ident.lower(), ident.lower())).fetchone()
            if not u or not crypto.check_password(password, u["password_hash"], u["salt"]):
                db.close()
                self.send_json({"ok": False, "error": "Неверный логин или пароль"}, 401); return
            if u["banned"]:
                reason = u["banned_reason"] or "нарушение правил"
                db.close()
                self.send_json({"ok": False, "error": f"Забанен: {reason}"}, 403); return

            priv_key, pub_key = crypto.generate_keypair()
            USER_KEYS[u["id"]] = {"private": priv_key, "public": pub_key}
            db.execute("""INSERT OR REPLACE INTO public_keys (user_id, public_key, updated_at)
                          VALUES (?, ?, ?)""",
                      (u["id"], str(pub_key), time.time()))
            db.execute("UPDATE users SET last_seen = ? WHERE id = ?",
                        (time.time(), u["id"]))
            db.commit()
            db.close()

            token = secrets.token_hex(32)
            SESSIONS[token] = u["id"]
            cookie = f"session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"
            self.send_json({"ok": True, "user_id": u["id"],
                            "is_admin": u["role"] in ("owner", "admin", "developer")},
                           cookie=cookie)
            return

        # LOGOUT
        if path == "/api/logout":
            ch = self.headers.get("Cookie", "")
            if ch:
                try:
                    c = SimpleCookie()
                    c.load(ch)
                    if "session" in c:
                        uid = SESSIONS.pop(c["session"].value, None)
                        if uid and uid in USER_KEYS:
                            del USER_KEYS[uid]
                except Exception:
                    pass
            self.send_json({"ok": True})
            return

        # SET EMOJI
        if path == "/api/set_emoji":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "Не авторизован"}, 401); return

            data = self.parse_json()
            emoji = (data.get("emoji") or "").strip()
            target_id = data.get("user_id")

            is_elite = emoji in ELITE_EMOJI
            is_regular = emoji in REGULAR_EMOJI
            if not is_elite and not is_regular:
                self.send_json({"ok": False, "error": "Недопустимый эмодзи"}, 400); return

            if target_id and int(target_id) != me:
                if not self.is_admin():
                    self.send_json({"ok": False, "error": "Только для админов"}, 403); return
                target_id = int(target_id)
            else:
                target_id = me

            if is_elite and target_id == me:
                db = get_db()
                u = db.execute("SELECT role FROM users WHERE id = ?", (me,)).fetchone()
                db.close()
                if not u or u["role"] not in ("owner", "admin", "developer"):
                    self.send_json({"ok": False,
                                    "error": "Элитные для админов"}, 403); return

            db = get_db()
            db.execute("UPDATE users SET emoji = ? WHERE id = ?", (emoji, target_id))
            db.commit()
            db.close()

            if self.is_admin() and target_id != me:
                self.log_admin_action(me, "set_emoji", target_id, emoji)

            self.send_json({"ok": True, "emoji": emoji})
            return

        # CREATE POST
        if path == "/api/post":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "Не авторизован"}, 401); return
            fields, files = self.parse_form()
            text = fields.get("text", "").strip()[:5000]
            image_name = None
            if "image" in files and files["image"].filename:
                image_name = self.save_uploaded_file(files["image"], POSTS_DIR,
                                                       ALLOWED_IMAGE_EXT, MAX_POST_IMAGE)
            if not text and not image_name:
                self.send_json({"ok": False, "error": "Пустой пост"}, 400); return
            db = get_db()
            c = db.cursor()
            c.execute("""INSERT INTO posts (user_id, text, image, created_at)
                          VALUES (?, ?, ?, ?)""",
                      (me, text, image_name, time.time()))
            db.commit()
            pid = c.lastrowid
            db.close()
            self.send_json({"ok": True, "post_id": pid})
            return

        # LIKE
        if path == "/api/like":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "Не авторизован"}, 401); return
            data = self.parse_json()
            post_id = data.get("post_id")
            if not post_id:
                self.send_json({"ok": False, "error": "Нет post_id"}, 400); return
            db = get_db()
            ex = db.execute("SELECT id FROM likes WHERE user_id = ? AND post_id = ?",
                             (me, post_id)).fetchone()
            if ex:
                db.execute("DELETE FROM likes WHERE id = ?", (ex["id"],))
                liked = False
            else:
                db.execute("INSERT INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)",
                            (me, post_id, time.time()))
                liked = True
            cnt = db.execute("SELECT COUNT(*) c FROM likes WHERE post_id = ?",
                              (post_id,)).fetchone()["c"]
            db.commit(); db.close()
            self.send_json({"ok": True, "liked": liked, "count": cnt})
            return

        # COMMENT
        if path == "/api/comment":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "Не авторизован"}, 401); return
            data = self.parse_json()
            post_id = data.get("post_id")
            text = (data.get("text") or "").strip()[:1000]
            if not post_id or not text:
                self.send_json({"ok": False, "error": "Нет данных"}, 400); return
            db = get_db()
            c = db.cursor()
            c.execute("""INSERT INTO comments (post_id, user_id, text, created_at)
                          VALUES (?, ?, ?, ?)""",
                      (post_id, me, text, time.time()))
            db.commit()
            cid = c.lastrowid
            u = db.execute("""SELECT username, display, avatar, emoji, verified
                              FROM users WHERE id = ?""", (me,)).fetchone()
            db.close()
            self.send_json({"ok": True, "comment": {
                "id": cid, "text": text, "username": u["username"],
                "display": u["display"], "avatar": u["avatar"],
                "emoji": u["emoji"], "verified": u["verified"],
                "created_at": time.time()
            }})
            return

        # FRIEND
        if path == "/api/friend":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "Не авторизован"}, 401); return
            data = self.parse_json()
            action = data.get("action")
            target = int(data.get("user_id", 0))
            if not target or action not in ("add", "accept", "decline", "remove"):
                self.send_json({"ok": False, "error": "Bad action"}, 400); return
            if target == me:
                self.send_json({"ok": False, "error": "Это ты"}, 400); return
            db = get_db()
            if action == "add":
                ex = db.execute("""SELECT * FROM friendships
                    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)""",
                    (me, target, target, me)).fetchone()
                if ex:
                    if ex["status"] == "pending" and ex["friend_id"] == me:
                        db.execute("UPDATE friendships SET status = 'accepted' WHERE id = ?",
                                    (ex["id"],))
                else:
                    db.execute("""INSERT INTO friendships (user_id, friend_id, status, created_at)
                                  VALUES (?, ?, 'pending', ?)""",
                                (me, target, time.time()))
            elif action == "accept":
                db.execute("""UPDATE friendships SET status = 'accepted'
                              WHERE user_id = ? AND friend_id = ? AND status = 'pending'""",
                            (target, me))
            elif action == "decline":
                db.execute("""DELETE FROM friendships
                              WHERE user_id = ? AND friend_id = ? AND status = 'pending'""",
                            (target, me))
            elif action == "remove":
                db.execute("""DELETE FROM friendships
                              WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)""",
                            (me, target, target, me))
            db.commit(); db.close()
            self.send_json({"ok": True})
            return

        # CREATE CHAT
        if path == "/api/create_chat":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "Не авторизован"}, 401); return
            data = self.parse_json()
            chat_type = data.get("type", "private")
            if chat_type not in ("private", "group", "channel"):
                self.send_json({"ok": False, "error": "Bad type"}, 400); return
            db = get_db()
            if chat_type == "private":
                other_id = int(data.get("user_id", 0))
                if not other_id or other_id == me:
                    db.close()
                    self.send_json({"ok": False, "error": "Bad user"}, 400); return
                existing = db.execute("""
                    SELECT c.id FROM chats c
                    JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
                    JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
                    WHERE c.type = 'private' LIMIT 1
                """, (me, other_id)).fetchone()
                if existing:
                    chat_id = existing["id"]
                else:
                    c = db.cursor()
                    c.execute("""INSERT INTO chats (type, created_by, created_at)
                                  VALUES ('private', ?, ?)""", (me, time.time()))
                    chat_id = c.lastrowid
                    db.execute("""INSERT INTO chat_members (chat_id, user_id, role, joined_at)
                                  VALUES (?, ?, 'member', ?), (?, ?, 'member', ?)""",
                              (chat_id, me, time.time(), chat_id, other_id, time.time()))
                db.commit(); db.close()
                self.send_json({"ok": True, "chat_id": chat_id, "created": not existing})
                return
            name = (data.get("name") or "").strip()[:50]
            description = (data.get("description") or "").strip()[:300]
            members = data.get("members", [])
            if not name:
                db.close()
                self.send_json({"ok": False, "error": "Введи название"}, 400); return
            c = db.cursor()
            c.execute("""INSERT INTO chats (type, name, description, created_by, created_at)
                          VALUES (?, ?, ?, ?, ?)""",
                      (chat_type, name, description, me, time.time()))
            chat_id = c.lastrowid
            db.execute("""INSERT INTO chat_members (chat_id, user_id, role, joined_at)
                          VALUES (?, ?, 'owner', ?)""",
                      (chat_id, me, time.time()))
            for uid in members:
                if uid == me: continue
                try:
                    uid = int(uid)
                    db.execute("""INSERT OR IGNORE INTO chat_members
                                  (chat_id, user_id, role, joined_at)
                                  VALUES (?, ?, 'member', ?)""",
                              (chat_id, uid, time.time()))
                except Exception:
                    pass
            db.commit(); db.close()
            self.send_json({"ok": True, "chat_id": chat_id})
            return
        # ═══ ADD MEMBER ═══
        if path == "/api/add_member":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "Не авторизован"}, 401); return

            data = self.parse_json()
            chat_id = int(data.get("chat_id", 0))
            user_id = int(data.get("user_id", 0))

            if not chat_id or not user_id:
                self.send_json({"ok": False, "error": "Нет данных"}, 400); return

            db = get_db()

            my_membership = db.execute("""
                SELECT role FROM chat_members
                WHERE chat_id = ? AND user_id = ?
            """, (chat_id, me)).fetchone()

            if not my_membership:
                db.close()
                self.send_json({"ok": False, "error": "Не участник"}, 403); return

            if my_membership["role"] not in ("owner", "admin"):
                db.close()
                self.send_json({"ok": False, "error": "Нет прав"}, 403); return

            chat = db.execute("SELECT type FROM chats WHERE id = ?", (chat_id,)).fetchone()
            if not chat:
                db.close()
                self.send_json({"ok": False, "error": "Чат не найден"}, 404); return

            if chat["type"] == "private":
                db.close()
                self.send_json({"ok": False, "error": "Нельзя добавить в ЛС"}, 400); return

            target = db.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
            if not target:
                db.close()
                self.send_json({"ok": False, "error": "Юзер не найден"}, 404); return

            try:
                db.execute("""
                    INSERT OR IGNORE INTO chat_members
                    (chat_id, user_id, role, joined_at)
                    VALUES (?, ?, 'member', ?)
                """, (chat_id, user_id, time.time()))
                db.commit()
                db.close()
                self.log_admin_action(me, "add_member", chat_id, f"@{target['username']}")
                self.send_json({"ok": True})
            except Exception as ex:
                db.close()
                self.send_json({"ok": False, "error": str(ex)}, 500)
            return

        # SEND MESSAGE
        if path == "/api/send_message":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "Не авторизован"}, 401); return
            data = self.parse_json()
            chat_id = data.get("chat_id")
            encrypted = data.get("encrypted")
            reply_to = data.get("reply_to")
            if not chat_id or not encrypted:
                self.send_json({"ok": False, "error": "Нет данных"}, 400); return
            db = get_db()
            member = db.execute("""SELECT * FROM chat_members
                                    WHERE chat_id = ? AND user_id = ?""",
                                 (chat_id, me)).fetchone()
            if not member:
                db.close()
                self.send_json({"ok": False, "error": "Не участник"}, 403); return
            c = db.cursor()
            c.execute("""INSERT INTO messages (chat_id, from_id, encrypted, reply_to, created_at)
                          VALUES (?, ?, ?, ?, ?)""",
                      (chat_id, me, encrypted, reply_to, time.time()))
            db.commit()
            mid = c.lastrowid
            u = db.execute("""SELECT username, display, avatar, emoji, verified
                              FROM users WHERE id = ?""", (me,)).fetchone()
            db.close()
            self.send_json({"ok": True, "message_id": mid,
                            "username": u["username"], "display": u["display"],
                            "avatar": u["avatar"], "emoji": u["emoji"],
                            "verified": u["verified"], "created_at": time.time()})
            return

        # MY PUBLIC KEY
        if path == "/api/my_key":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "Не авторизован"}, 401); return
            if me not in USER_KEYS:
                priv, pub = crypto.generate_keypair()
                USER_KEYS[me] = {"private": priv, "public": pub}
                db = get_db()
                db.execute("""INSERT OR REPLACE INTO public_keys (user_id, public_key, updated_at)
                              VALUES (?, ?, ?)""",
                          (me, str(pub), time.time()))
                db.commit(); db.close()
            self.send_json({"ok": True, "public_key": str(USER_KEYS[me]["public"])})
            return

        # PROFILE
        if path == "/api/profile":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "Не авторизован"}, 401); return

            ct = self.headers.get("Content-Type", "")
            files = {}
            fields = {}

            try:
                if "multipart/form-data" in ct:
                    fields, files = self.parse_form()
                elif "application/json" in ct:
                    data = self.parse_json()
                    fields = {k: str(v) for k, v in data.items() if v is not None}
                else:
                    fields, files = self.parse_form()
            except Exception as ex:
                self.send_json({"ok": False, "error": f"Ошибка: {ex}"}, 400)
                return

            bio = (fields.get("bio") or "")[:300]
            display = (fields.get("display") or "").strip()[:40]

            db = get_db()
            if display:
                db.execute("UPDATE users SET bio = ?, display = ? WHERE id = ?",
                            (bio, display, me))
            else:
                db.execute("UPDATE users SET bio = ? WHERE id = ?", (bio, me))
            db.commit(); db.close()
            self.send_json({"ok": True})
            return

        # CHANGE PASSWORD
        if path == "/api/change_password":
            me = self.get_session_user()
            if not me:
                self.send_json({"ok": False, "error": "Не авторизован"}, 401); return
            data = self.parse_json()
            old_pw = data.get("old_password", "")
            new_pw = data.get("new_password", "")
            if len(new_pw) < 6:
                self.send_json({"ok": False, "error": "Мин 6"}, 400); return
            db = get_db()
            u = db.execute("SELECT * FROM users WHERE id = ?", (me,)).fetchone()
            if not crypto.check_password(old_pw, u["password_hash"], u["salt"]):
                db.close()
                self.send_json({"ok": False, "error": "Неверный пароль"}, 401); return
            h, salt = crypto.hash_password(new_pw)
            db.execute("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
                        (h, salt, me))
            db.commit(); db.close()
            self.send_json({"ok": True})
            return

        # ADMIN ACTIONS
        if path == "/api/admin/verify":
            if not self.is_admin():
                self.send_json({"ok": False, "error": "Не админ"}, 403); return
            me = self.get_session_user()
            data = self.parse_json()
            target = int(data.get("user_id", 0))
            value = 1 if data.get("value", True) else 0
            if not target:
                self.send_json({"ok": False, "error": "Нет user_id"}, 400); return
            db = get_db()
            t = db.execute("SELECT username, role FROM users WHERE id = ?", (target,)).fetchone()
            if not t:
                db.close()
                self.send_json({"ok": False, "error": "Не найден"}, 404); return
            if value == 0:
                if t["role"] in ("owner", "admin") and not self.is_owner():
                    db.close()
                    self.send_json({"ok": False, "error": "Только владелец"}, 403); return
            db.execute("UPDATE users SET verified = ? WHERE id = ?", (value, target))
            db.commit(); db.close()
            self.log_admin_action(me, "verify" if value else "unverify", target,
                                    f"@{t['username']}")
            self.send_json({"ok": True})
            return

        if path == "/api/admin/ban":
            if not self.is_admin():
                self.send_json({"ok": False, "error": "Не админ"}, 403); return
            me = self.get_session_user()
            data = self.parse_json()
            target = int(data.get("user_id", 0))
            reason = (data.get("reason") or "нарушение правил")[:200]
            if not target:
                self.send_json({"ok": False, "error": "Нет user_id"}, 400); return
            if target == me:
                self.send_json({"ok": False, "error": "Нельзя себя"}, 400); return
            db = get_db()
            t = db.execute("SELECT username, role FROM users WHERE id = ?", (target,)).fetchone()
            if not t:
                db.close()
                self.send_json({"ok": False, "error": "Не найден"}, 404); return
            if t["role"] == "owner":
                db.close()
                self.send_json({"ok": False, "error": "Нельзя владельца"}, 403); return
            if t["role"] == "admin" and not self.is_owner():
                db.close()
                self.send_json({"ok": False, "error": "Только владелец"}, 403); return
            db.execute("UPDATE users SET banned = 1, banned_reason = ? WHERE id = ?",
                        (reason, target))
            db.commit(); db.close()
            self.log_admin_action(me, "ban", target, reason)
            self.send_json({"ok": True})
            return

        if path == "/api/admin/unban":
            if not self.is_admin():
                self.send_json({"ok": False, "error": "Не админ"}, 403); return
            me = self.get_session_user()
            data = self.parse_json()
            target = int(data.get("user_id", 0))
            if not target:
                self.send_json({"ok": False, "error": "Нет user_id"}, 400); return
            db = get_db()
            db.execute("UPDATE users SET banned = 0, banned_reason = '' WHERE id = ?",
                        (target,))
            db.commit(); db.close()
            self.log_admin_action(me, "unban", target)
            self.send_json({"ok": True})
            return

        if path == "/api/admin/make_admin":
            if not self.is_owner():
                self.send_json({"ok": False, "error": "Только владелец"}, 403); return
            me = self.get_session_user()
            data = self.parse_json()
            target = int(data.get("user_id", 0))
            if not target:
                self.send_json({"ok": False, "error": "Нет user_id"}, 400); return
            db = get_db()
            db.execute("UPDATE users SET role = 'admin' WHERE id = ? AND role != 'owner'",
                        (target,))
            db.commit(); db.close()
            self.log_admin_action(me, "make_admin", target)
            self.send_json({"ok": True})
            return

        if path == "/api/admin/remove_admin":
            if not self.is_owner():
                self.send_json({"ok": False, "error": "Только владелец"}, 403); return
            me = self.get_session_user()
            data = self.parse_json()
            target = int(data.get("user_id", 0))
            if not target:
                self.send_json({"ok": False, "error": "Нет user_id"}, 400); return
            db = get_db()
            db.execute("UPDATE users SET role = 'user' WHERE id = ? AND role = 'admin'",
                        (target,))
            db.commit(); db.close()
            self.log_admin_action(me, "remove_admin", target)
            self.send_json({"ok": True})
            return

        if path == "/api/admin/delete_post":
            if not self.is_admin():
                self.send_json({"ok": False, "error": "Не админ"}, 403); return
            me = self.get_session_user()
            data = self.parse_json()
            post_id = int(data.get("post_id", 0))
            if not post_id:
                self.send_json({"ok": False, "error": "Нет post_id"}, 400); return
            db = get_db()
            db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
            db.execute("DELETE FROM likes WHERE post_id = ?", (post_id,))
            db.execute("DELETE FROM comments WHERE post_id = ?", (post_id,))
            db.commit(); db.close()
            self.log_admin_action(me, "delete_post", post_id)
            self.send_json({"ok": True})
            return

        self.send_json({"ok": False, "error": "unknown endpoint"}, 404)

    # СЕРИАЛИЗАЦИЯ
    def serialize_user(self, u, is_self=False, admin_view=False):
        data = {
            "id": u["id"],
            "username": u["username"],
            "display": u["display"],
            "avatar": u["avatar"],
            "emoji": (u["emoji"] if "emoji" in u.keys() else None) or "🐱",
            "bio": u["bio"] or "",
            "role": u["role"],
            "verified": bool(u["verified"]),
            "created_at": u["created_at"],
            "last_seen": u["last_seen"],
            "online": (time.time() - (u["last_seen"] or 0)) < 300,
        }
        if is_self or admin_view:
            data["email"] = u["email"]
            data["banned"] = bool(u["banned"])
            data["banned_reason"] = u["banned_reason"] or ""
        return data

    def serialize_post(self, db, row, me):
        pid = row["id"]
        likes = db.execute("SELECT COUNT(*) c FROM likes WHERE post_id = ?",
                            (pid,)).fetchone()["c"]
        comments = db.execute("SELECT COUNT(*) c FROM comments WHERE post_id = ?",
                               (pid,)).fetchone()["c"]
        liked = False
        if me:
            liked = db.execute("SELECT id FROM likes WHERE user_id = ? AND post_id = ?",
                                (me, pid)).fetchone() is not None
        return {
            "id": pid, "user_id": row["user_id"],
            "username": row["username"], "display": row["display"],
            "avatar": row["avatar"], "emoji": row["emoji"] or "🐱",
            "verified": bool(row["verified"]),
            "role": row["role"],
            "text": row["text"], "image": row["image"],
            "created_at": row["created_at"],
            "likes_count": likes, "comments_count": comments, "liked": liked,
        }

# ═══════════════════════════════════════════════════════════
#  ЗАПУСК
# ═══════════════════════════════════════════════════════════
def find_free_port(start=8000, attempts=20):
    import socket as _s
    for p in range(start, start + attempts):
        try:
            s = _s.socket(_s.AF_INET, _s.SOCK_STREAM)
            s.setsockopt(_s.SOL_SOCKET, _s.SO_REUSEADDR, 1)
            s.bind(("127.0.0.1", p)); s.close(); return p
        except OSError:
            continue
    return start

def main():
    if os.name == "nt":
        os.system("")

    print("=" * 60)
    print("  ZvenoBack v5.0 — ФИНАЛ")
    print("=" * 60)
    init_db()
    print("  ✓ База готова")
    print("  ✓ Крипто-модуль загружен")
    print(f"  ✓ Владелец: {OWNER_EMAIL}")
    print(f"  ✓ Эмодзи: {len(REGULAR_EMOJI)} обычных + {len(ELITE_EMOJI)} элитных")

    global PORT
    PORT = find_free_port(PORT)

    try:
        import socket as _s
        hostname = _s.gethostname()
        local_ip = _s.gethostbyname(hostname)
        print(f"  Локальный IP: {local_ip}")
    except Exception:
        local_ip = "?"

    print(f"  Локально: http://127.0.0.1:{PORT}")
    print(f"  Для друзей: http://{local_ip}:{PORT}")
    print("=" * 60)

    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\n  Остановлено.")
    except OSError as e:
        print(f"  [!] Порт {PORT}: {e}")

if __name__ == "__main__":
    main()