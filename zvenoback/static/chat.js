// ═══════════════════════════════════════════════════════════
//  ZVENOBACK — Чат v4.0 (Base64 + добавление участников)
// ═══════════════════════════════════════════════════════════

let me = null;
let chatId = null;
let chatInfo = null;
let chatPartner = null;
let messages = [];
let pollTimer = null;
let lastMessageId = 0;

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
async function initChat() {
    me = await ZB.checkAuth(true);
    if (!me) return;

    const path = window.location.pathname;
    const match = path.match(/^\/chat\/(\d+)/);
    if (!match) {
        window.location.href = "/chats";
        return;
    }
    chatId = parseInt(match[1]);

    await ZB.mountHeader("header-container", "chats");

    const res = await ZB.get(`/api/chat/${chatId}`);
    if (!res.ok) {
        ZB.toast("Чат не найден: " + (res.error || "?"), "error");
        setTimeout(() => window.location.href = "/chats", 1200);
        return;
    }
    chatInfo = res.chat;
    if (chatInfo.type === "private" && chatInfo.other_user) {
        chatPartner = chatInfo.other_user;
    }

    renderChatHeader();
    await loadMessages();

    setupInput();
    setupPoll();
    loadSidebar();
    setupAddMemberModal();
}

// ═══════════════════════════════════════════════════════════
//  BASE64
// ═══════════════════════════════════════════════════════════
function encodeMessage(text) {
    try {
        return btoa(unescape(encodeURIComponent(text)));
    } catch (e) { return null; }
}

function decodeMessage(encoded) {
    if (!encoded) return "[пусто]";
    try {
        return decodeURIComponent(escape(atob(encoded)));
    } catch (e) {
        return encoded;
    }
}

// ═══════════════════════════════════════════════════════════
//  ШАПКА ЧАТА
// ═══════════════════════════════════════════════════════════
function renderChatHeader() {
    const el = document.getElementById("chat-header");
    if (!el) return;

    let avatarHtml, nameHtml, statusHtml;
    let actionsHtml = "";

    if (chatInfo.type === "private" && chatInfo.other_user) {
        const o = chatInfo.other_user;
        avatarHtml = ZB.renderAvatar(o, "avatar", o.online);
        nameHtml = `
            ${ZB.escapeHtml(o.display || o.username)}
            ${o.verified ? ZB.verifiedBadge(true) : ""}
        `;
        statusHtml = o.online ? "🟢 онлайн" : "⚫ был(а) " + ZB.formatTime(o.last_seen);
    } else {
        const emoji = chatInfo.emoji || (chatInfo.type === "group" ? "👥" : "📢");
        avatarHtml = `<div class="avatar">${ZB.escapeHtml(emoji)}</div>`;
        const badge = chatInfo.type === "group" ? "👥 Группа" : "📢 Канал";
        nameHtml = `${badge} ${ZB.escapeHtml(chatInfo.name || "")}`;
        statusHtml = `${chatInfo.members ? chatInfo.members.length : 0} участников`;

        const canAdd = chatInfo.my_role === "owner" || chatInfo.my_role === "admin";
        if (canAdd) {
            actionsHtml = `
                <button class="chat-header-btn" id="chat-add-member-btn" title="Добавить участника">
                    ➕ Добавить
                </button>
                <button class="chat-header-btn" id="chat-members-btn" title="Участники">
                    👥 ${chatInfo.members ? chatInfo.members.length : 0}
                </button>
            `;
        } else {
            actionsHtml = `
                <button class="chat-header-btn" id="chat-members-btn" title="Участники">
                    👥 ${chatInfo.members ? chatInfo.members.length : 0}
                </button>
            `;
        }
    }

    el.innerHTML = `
        <div class="chat-header-left">
            <a href="/chats" class="chat-back-btn-mobile">←</a>
            ${avatarHtml}
            <div class="chat-header-info">
                <div class="chat-header-name">${nameHtml}</div>
                <div class="chat-header-status">${statusHtml}</div>
            </div>
        </div>
        <div class="chat-header-right">
            ${actionsHtml}
            <span class="chat-header-lock" title="Только участники">🔐</span>
        </div>
    `;

    const addBtn = document.getElementById("chat-add-member-btn");
    if (addBtn) addBtn.addEventListener("click", openAddMemberModal);

    const membersBtn = document.getElementById("chat-members-btn");
    if (membersBtn) membersBtn.addEventListener("click", showMembersList);
}

function showMembersList() {
    if (!chatInfo.members) return;

    const html = `
        <div class="modal-header">
            <h3>👥 Участники (${chatInfo.members.length})</h3>
            <button class="modal-close" id="members-modal-close">✕</button>
        </div>
        <div class="members-list">
            ${chatInfo.members.map(m => `
                <a href="/u/${m.username}" class="member-row">
                    ${ZB.renderAvatar(m, "avatar")}
                    <div class="member-info">
                        <div class="member-name">
                            ${ZB.renderName(m)}
                            ${m.role === "owner" ? `<span class="member-role member-owner">👑</span>` : ""}
                            ${m.role === "admin" ? `<span class="member-role member-admin">⚙</span>` : ""}
                        </div>
                        <div class="member-login">@${ZB.escapeHtml(m.username)}</div>
                    </div>
                </a>
            `).join("")}
        </div>
    `;

    const modal = ZB.showModal(html);
    document.getElementById("members-modal-close").addEventListener("click", () => modal.close());
}

// ═══════════════════════════════════════════════════════════
//  МОДАЛКА ДОБАВЛЕНИЯ УЧАСТНИКА
// ═══════════════════════════════════════════════════════════
function setupAddMemberModal() {
    const modal = document.getElementById("add-member-modal");
    if (!modal) return;

    document.querySelectorAll("[data-close-add-member]").forEach(btn => {
        btn.addEventListener("click", () => modal.classList.add("hidden"));
    });

    modal.addEventListener("click", (e) => {
        if (e.target.id === "add-member-modal") modal.classList.add("hidden");
    });

    const input = document.getElementById("add-member-search");
    const results = document.getElementById("add-member-results");
    const errEl = document.getElementById("add-member-error");
    if (!input || !results) return;

    let timer = null;
    input.addEventListener("input", () => {
        if (timer) clearTimeout(timer);
        const q = input.value.trim();
        errEl.textContent = "";

        if (!q) {
            results.innerHTML = "";
            return;
        }

        timer = setTimeout(async () => {
            const res = await ZB.get(`/api/search?q=${encodeURIComponent(q)}`);
            if (!res.ok || !res.users.length) {
                results.innerHTML = `<div class="new-chat-empty">Никого не найдено</div>`;
                return;
            }

            const memberIds = chatInfo.members.map(m => m.id);
            const users = res.users.filter(u =>
                u.id !== me.id && !memberIds.includes(u.id)
            );

            if (!users.length) {
                results.innerHTML = `<div class="new-chat-empty">Все уже в чате</div>`;
                return;
            }

            results.innerHTML = users.map(u => `
                <div class="new-chat-user" data-uid="${u.id}">
                    ${ZB.renderAvatar(u, "avatar-sm")}
                    <div>
                        <div class="new-chat-user-name">${ZB.renderName(u)}</div>
                        <div class="new-chat-user-login">@${ZB.escapeHtml(u.username)}</div>
                    </div>
                    <span class="new-chat-user-add">+</span>
                </div>
            `).join("");

            results.querySelectorAll(".new-chat-user").forEach(el => {
                el.addEventListener("click", () => {
                    const uid = parseInt(el.dataset.uid);
                    const user = users.find(u => u.id === uid);
                    addMemberToChat(uid, user);
                });
            });
        }, 350);
    });
}

function openAddMemberModal() {
    const modal = document.getElementById("add-member-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    document.getElementById("add-member-search").value = "";
    document.getElementById("add-member-results").innerHTML = "";
    document.getElementById("add-member-error").textContent = "";
    document.getElementById("add-member-search").focus();
}

async function addMemberToChat(userId, user) {
    const errEl = document.getElementById("add-member-error");
    errEl.textContent = "";

    const res = await ZB.post("/api/add_member", {
        chat_id: chatId,
        user_id: userId,
    });

    if (!res.ok) {
        errEl.textContent = res.error || "Ошибка";
        return;
    }

    ZB.toast(`@${user.username} добавлен ✓`, "success");

    const fresh = await ZB.get(`/api/chat/${chatId}`);
    if (fresh.ok) {
        chatInfo = fresh.chat;
        renderChatHeader();
    }

    const input = document.getElementById("add-member-search");
    if (input) input.dispatchEvent(new Event("input"));
}

// ═══════════════════════════════════════════════════════════
//  ЗАГРУЗКА СООБЩЕНИЙ
// ═══════════════════════════════════════════════════════════
async function loadMessages() {
    const res = await ZB.get(`/api/chat/${chatId}/messages?limit=100`);
    const el = document.getElementById("chat-messages");
    if (!el) return;

    if (!res.ok) {
        el.innerHTML = `<div class="chat-empty">Ошибка загрузки</div>`;
        return;
    }

    messages = res.messages || [];

    if (!messages.length) {
        el.innerHTML = `
            <div class="chat-empty">
                <div class="chat-empty-icon">💬</div>
                <div>Нет сообщений</div>
                <div style="font-size:12px;margin-top:6px;">Напиши первое!</div>
            </div>
        `;
        return;
    }

    if (messages.length) {
        lastMessageId = Math.max(...messages.map(m => m.id));
    }

    el.innerHTML = messages.map(m => renderMessage(m)).join("");
    el.scrollTop = el.scrollHeight;
}

function renderMessage(m) {
    const isOwn = m.from_id === me.id;
    const text = decodeMessage(m.encrypted);

    const avatarHtml = ZB.renderAvatar({
        username: m.username,
        display: m.display,
        avatar: m.avatar,
        emoji: m.emoji,
    }, "avatar-sm");

    return `
        <div class="msg ${isOwn ? "msg-own" : ""}" data-msg-id="${m.id}">
            ${!isOwn ? `<div class="msg-avatar">${avatarHtml}</div>` : ""}
            <div class="msg-body">
                ${!isOwn ? `<div class="msg-author">${ZB.escapeHtml(m.display || m.username)}</div>` : ""}
                <div class="msg-bubble">
                    <div class="msg-text">${ZB.escapeHtml(text)}</div>
                    <div class="msg-time">${ZB.formatTime(m.created_at)}</div>
                </div>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════
//  ВВОД
// ═══════════════════════════════════════════════════════════
function setupInput() {
    const input = document.getElementById("chat-input");
    const btn = document.getElementById("chat-send-btn");
    if (!input || !btn) return;

    const updateBtn = () => {
        btn.disabled = input.value.trim().length === 0;
    };

    input.addEventListener("input", () => {
        updateBtn();
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 150) + "px";
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    btn.addEventListener("click", sendMessage);
}

async function sendMessage() {
    const input = document.getElementById("chat-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const btn = document.getElementById("chat-send-btn");
    btn.disabled = true;

    const encoded = encodeMessage(text);
    if (!encoded) {
        ZB.toast("Ошибка кодирования", "error");
        btn.disabled = false;
        return;
    }

    const res = await ZB.post("/api/send_message", {
        chat_id: chatId,
        encrypted: encoded,
    });

    if (res.ok) {
        input.value = "";
        input.style.height = "auto";
        btn.disabled = true;

        const newMsg = {
            id: res.message_id,
            chat_id: chatId,
            from_id: me.id,
            username: me.username,
            display: me.display,
            avatar: me.avatar,
            emoji: me.emoji,
            encrypted: encoded,
            created_at: res.created_at,
        };
        messages.push(newMsg);
        lastMessageId = res.message_id;

        const el = document.getElementById("chat-messages");
        if (el.querySelector(".chat-empty")) el.innerHTML = "";
        el.insertAdjacentHTML("beforeend", renderMessage(newMsg));
        el.scrollTop = el.scrollHeight;
    } else {
        ZB.toast(res.error || "Ошибка", "error");
        btn.disabled = false;
    }
}

// ═══════════════════════════════════════════════════════════
//  POLLING
// ═══════════════════════════════════════════════════════════
function setupPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(checkNewMessages, 3000);
}

async function checkNewMessages() {
    if (!chatId) return;
    try {
        const res = await ZB.get(`/api/chat/${chatId}/messages?limit=100`);
        if (!res.ok || !res.messages) return;

        const newMsgs = res.messages.filter(m => m.id > lastMessageId);
        if (!newMsgs.length) return;

        const el = document.getElementById("chat-messages");
        if (!el) return;

        if (el.querySelector(".chat-empty")) el.innerHTML = "";

        for (const m of newMsgs) {
            el.insertAdjacentHTML("beforeend", renderMessage(m));
            lastMessageId = Math.max(lastMessageId, m.id);
            messages.push(m);
        }
        el.scrollTop = el.scrollHeight;
    } catch (e) {}
}

// ═══════════════════════════════════════════════════════════
//  САЙДБАР
// ═══════════════════════════════════════════════════════════
async function loadSidebar() {
    const res = await ZB.get("/api/chats");
    const el = document.getElementById("chats-list");
    if (!el) return;
    if (!res.ok) return;

    const chats = res.chats || [];
    el.innerHTML = chats.map(c => {
        let nameHtml = "";
        let avatarHtml = "";

        if (c.type === "private" && c.other_user) {
            avatarHtml = ZB.renderAvatar(c.other_user, "avatar-sm");
            nameHtml = ZB.escapeHtml(c.other_user.display || c.other_user.username);
        } else {
            const emoji = c.emoji || (c.type === "group" ? "👥" : "📢");
            avatarHtml = `<div class="avatar avatar-sm">${ZB.escapeHtml(emoji)}</div>`;
            nameHtml = ZB.escapeHtml(c.name || "");
        }

        const active = c.id === chatId ? "active" : "";
        return `
            <a href="/chat/${c.id}" class="chat-side-item ${active}">
                ${avatarHtml}
                <div class="chat-side-name">${nameHtml}</div>
            </a>
        `;
    }).join("");
}

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", initChat);