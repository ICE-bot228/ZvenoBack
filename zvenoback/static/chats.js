// ═══════════════════════════════════════════════════════════
//  ZVENOBACK — Список чатов v2.0 (с выбором участников)
// ═══════════════════════════════════════════════════════════

let me = null;
let chats = [];
let currentType = "private";
let selectedUser = null;

// Выбранные участники для каждого типа
let selectedGroupMembers = [];
let selectedChannelMembers = [];

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
async function initChats() {
    me = await ZB.checkAuth(true);
    if (!me) return;

    await ZB.mountHeader("header-container", "chats");

    await loadChats();

    setupNewChatModal();
    setupChatsSearch();
    setupNewChatTabs();
    setupNewChatSearch();
    setupGroupSearch();
    setupChannelSearch();

    const params = new URLSearchParams(window.location.search);
    const userId = params.get("user");
    if (userId) {
        await openPrivateChat(parseInt(userId));
    }
}

// ═══════════════════════════════════════════════════════════
//  ЗАГРУЗКА ЧАТОВ
// ═══════════════════════════════════════════════════════════
async function loadChats() {
    const res = await ZB.get("/api/chats");
    const list = document.getElementById("chats-list");
    if (!list) return;

    if (!res.ok) {
        list.innerHTML = `<div class="chats-empty">Ошибка загрузки</div>`;
        return;
    }

    chats = res.chats || [];

    if (!chats.length) {
        list.innerHTML = `
            <div class="chats-empty">
                <div class="chats-empty-icon">💬</div>
                <div>Пока нет чатов</div>
                <div style="font-size:11px;margin-top:6px;">Нажми <b>+</b> чтобы создать</div>
            </div>
        `;
        return;
    }

    list.innerHTML = chats.map(c => renderChatItem(c)).join("");
}

function renderChatItem(c) {
    let avatarHtml = "";
    let nameHtml = "";
    let lastMsgHtml = "";
    let badgeHtml = "";

    if (c.type === "private" && c.other_user) {
        avatarHtml = ZB.renderAvatar(c.other_user, "avatar", c.other_user.online);
        nameHtml = `
            ${ZB.escapeHtml(c.other_user.display || c.other_user.username)}
            ${c.other_user.verified ? ZB.verifiedBadge(true) : ""}
        `;
    } else {
        const emoji = c.emoji || (c.type === "group" ? "👥" : "📢");
        avatarHtml = `<div class="avatar">${ZB.escapeHtml(emoji)}</div>`;
        const badge = c.type === "group" ? "👥" : "📢";
        nameHtml = `${badge} ${ZB.escapeHtml(c.name || "Без названия")}`;
    }

    if (c.last_message && c.last_message.created_at) {
        lastMsgHtml = `<div class="chat-item-last">
            <span class="chat-item-last-from">${ZB.escapeHtml(c.last_message.from_username || "")}:</span>
            <span class="chat-item-last-lock">🔐 сообщение</span>
        </div>`;
    } else {
        lastMsgHtml = `<div class="chat-item-last" style="color:var(--text-dim);">Нет сообщений</div>`;
    }

    if (c.unread > 0) {
        badgeHtml = `<div class="chat-item-badge">${c.unread}</div>`;
    }

    const timeHtml = c.last_message && c.last_message.created_at
        ? `<div class="chat-item-time">${ZB.formatTimeShort(c.last_message.created_at)}</div>`
        : "";

    return `
        <a href="/chat/${c.id}" class="chat-item">
            <div class="chat-item-avatar">
                ${avatarHtml}
            </div>
            <div class="chat-item-info">
                <div class="chat-item-top">
                    <div class="chat-item-name">${nameHtml}</div>
                    ${timeHtml}
                </div>
                ${lastMsgHtml}
            </div>
            ${badgeHtml}
        </a>
    `;
}

// ═══════════════════════════════════════════════════════════
//  ПОИСК ЧАТОВ
// ═══════════════════════════════════════════════════════════
function setupChatsSearch() {
    const input = document.getElementById("chats-search");
    if (!input) return;
    input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        document.querySelectorAll(".chat-item").forEach(item => {
            const name = item.querySelector(".chat-item-name").textContent.toLowerCase();
            item.style.display = name.includes(q) ? "" : "none";
        });
    });
}

// ═══════════════════════════════════════════════════════════
//  МОДАЛКА НОВОГО ЧАТА
// ═══════════════════════════════════════════════════════════
function setupNewChatModal() {
    const modal = document.getElementById("new-chat-modal");
    const openBtn = document.getElementById("chats-new-btn");

    if (openBtn) {
        openBtn.addEventListener("click", () => {
            modal.classList.remove("hidden");
            document.getElementById("new-chat-error").textContent = "";
            currentType = "private";
            selectedUser = null;
            selectedGroupMembers = [];
            selectedChannelMembers = [];
            renderSelectedMembers("group");
            renderSelectedMembers("channel");
            updateNewChatTabs();
        });
    }

    document.querySelectorAll("[data-close-new-chat]").forEach(btn => {
        btn.addEventListener("click", () => modal.classList.add("hidden"));
    });

    modal.addEventListener("click", (e) => {
        if (e.target.id === "new-chat-modal") modal.classList.add("hidden");
    });

    const createBtn = document.getElementById("new-chat-create");
    createBtn.addEventListener("click", createChat);
}

function setupNewChatTabs() {
    document.querySelectorAll(".new-chat-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            currentType = tab.dataset.type;
            updateNewChatTabs();
        });
    });
}

function updateNewChatTabs() {
    document.querySelectorAll(".new-chat-tab").forEach(t =>
        t.classList.toggle("active", t.dataset.type === currentType));

    document.querySelectorAll(".new-chat-pane").forEach(p =>
        p.classList.add("hidden"));

    if (currentType === "private") {
        document.getElementById("new-chat-private").classList.remove("hidden");
    } else if (currentType === "group") {
        document.getElementById("new-chat-group").classList.remove("hidden");
    } else if (currentType === "channel") {
        document.getElementById("new-chat-channel").classList.remove("hidden");
    }
}

// ═══════════════════════════════════════════════════════════
//  ПОИСК ЮЗЕРА (для ЛС)
// ═══════════════════════════════════════════════════════════
function setupNewChatSearch() {
    const input = document.getElementById("new-chat-user-search");
    const results = document.getElementById("new-chat-user-results");
    if (!input) return;

    let timer = null;
    input.addEventListener("input", () => {
        if (timer) clearTimeout(timer);
        const q = input.value.trim();
        selectedUser = null;

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
            const users = res.users.filter(u => u.id !== me.id);
            results.innerHTML = users.map(u => `
                <div class="new-chat-user" data-uid="${u.id}">
                    ${ZB.renderAvatar(u, "avatar-sm")}
                    <div>
                        <div class="new-chat-user-name">${ZB.renderName(u)}</div>
                        <div class="new-chat-user-login">@${ZB.escapeHtml(u.username)}</div>
                    </div>
                </div>
            `).join("");

            results.querySelectorAll(".new-chat-user").forEach(el => {
                el.addEventListener("click", () => {
                    results.querySelectorAll(".new-chat-user").forEach(x =>
                        x.classList.remove("selected"));
                    el.classList.add("selected");
                    selectedUser = parseInt(el.dataset.uid);
                });
            });
        }, 350);
    });
}

// ═══════════════════════════════════════════════════════════
//  ПОИСК ЮЗЕРОВ ДЛЯ ГРУППЫ / КАНАЛА
// ═══════════════════════════════════════════════════════════
function setupGroupSearch() {
    setupMemberSearch("new-chat-group-search", "new-chat-group-results", "group");
}

function setupChannelSearch() {
    setupMemberSearch("new-chat-channel-search", "new-chat-channel-results", "channel");
}

function setupMemberSearch(inputId, resultsId, type) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);
    if (!input || !results) return;

    let timer = null;
    input.addEventListener("input", () => {
        if (timer) clearTimeout(timer);
        const q = input.value.trim();

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

            // Фильтруем: не я + не уже выбранные
            const selectedList = type === "group" ? selectedGroupMembers : selectedChannelMembers;
            const selectedIds = selectedList.map(u => u.id);
            const users = res.users.filter(u => u.id !== me.id && !selectedIds.includes(u.id));

            if (!users.length) {
                results.innerHTML = `<div class="new-chat-empty">Никого не найдено</div>`;
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
                    addMemberTo(type, users.find(u => u.id === parseInt(el.dataset.uid)));
                    input.value = "";
                    results.innerHTML = "";
                });
            });
        }, 350);
    });
}

function addMemberTo(type, user) {
    if (!user) return;
    if (type === "group") {
        if (!selectedGroupMembers.find(u => u.id === user.id)) {
            selectedGroupMembers.push(user);
        }
    } else {
        if (!selectedChannelMembers.find(u => u.id === user.id)) {
            selectedChannelMembers.push(user);
        }
    }
    renderSelectedMembers(type);
}

function removeMemberFrom(type, userId) {
    if (type === "group") {
        selectedGroupMembers = selectedGroupMembers.filter(u => u.id !== userId);
    } else {
        selectedChannelMembers = selectedChannelMembers.filter(u => u.id !== userId);
    }
    renderSelectedMembers(type);
}

function renderSelectedMembers(type) {
    const wrap = document.getElementById(
        type === "group" ? "new-chat-group-selected" : "new-chat-channel-selected"
    );
    if (!wrap) return;

    const list = type === "group" ? selectedGroupMembers : selectedChannelMembers;

    if (!list.length) {
        wrap.innerHTML = "";
        return;
    }

    wrap.innerHTML = list.map(u => `
        <div class="selected-member" data-uid="${u.id}">
            ${ZB.renderAvatar(u, "avatar-sm")}
            <span class="selected-member-name">${ZB.renderName(u)}</span>
            <button class="selected-member-remove" data-type="${type}" data-uid="${u.id}">✕</button>
        </div>
    `).join("");

    wrap.querySelectorAll(".selected-member-remove").forEach(btn => {
        btn.addEventListener("click", () => {
            removeMemberFrom(btn.dataset.type, parseInt(btn.dataset.uid));
        });
    });
}

// ═══════════════════════════════════════════════════════════
//  СОЗДАНИЕ ЧАТА
// ═══════════════════════════════════════════════════════════
async function createChat() {
    const errEl = document.getElementById("new-chat-error");
    const btn = document.getElementById("new-chat-create");
    errEl.textContent = "";

    let body = { type: currentType };

    if (currentType === "private") {
        if (!selectedUser) {
            errEl.textContent = "Выбери юзера";
            return;
        }
        body.user_id = selectedUser;
    } else if (currentType === "group") {
        const name = document.getElementById("new-chat-group-name").value.trim();
        if (!name) {
            errEl.textContent = "Введи название";
            return;
        }
        body.name = name;
        body.description = document.getElementById("new-chat-group-desc").value.trim();
        body.members = selectedGroupMembers.map(u => u.id);
    } else if (currentType === "channel") {
        const name = document.getElementById("new-chat-channel-name").value.trim();
        if (!name) {
            errEl.textContent = "Введи название";
            return;
        }
        body.name = name;
        body.description = document.getElementById("new-chat-channel-desc").value.trim();
        body.members = selectedChannelMembers.map(u => u.id);
    }

    btn.disabled = true;
    btn.textContent = "Создание...";

    const res = await ZB.post("/api/create_chat", body);

    if (res.ok) {
        ZB.toast("Чат создан ✓", "success");
        window.location.href = `/chat/${res.chat_id}`;
    } else {
        errEl.textContent = res.error || "Ошибка";
        btn.disabled = false;
        btn.textContent = "Создать";
    }
}

// ═══════════════════════════════════════════════════════════
//  ОТКРЫТЬ ЛС
// ═══════════════════════════════════════════════════════════
async function openPrivateChat(userId) {
    const res = await ZB.post("/api/create_chat", {
        type: "private",
        user_id: userId,
    });
    if (res.ok) {
        window.location.href = `/chat/${res.chat_id}`;
    } else {
        ZB.toast(res.error || "Ошибка", "error");
    }
}

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", initChats);