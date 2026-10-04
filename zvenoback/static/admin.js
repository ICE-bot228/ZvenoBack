// ═══════════════════════════════════════════════════════════
//  ZVENOBACK — Админ-панель v4.0 (с эмодзи-пикером)
// ═══════════════════════════════════════════════════════════

let adminUser = null;
let currentQuery = "";
let currentOffset = 0;
const PAGE_SIZE = 50;
let currentUsers = [];
let logLoaded = false;
let emojiPickerUserId = null;
let emojiPickerSelected = null;

// ═══════════════════════════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════
async function initAdmin() {
    const me = await ZB.get("/api/me");
    if (!me.ok || !["owner", "admin", "developer"].includes(me.user.role)) {
        ZB.toast("Доступ только для администрации", "error");
        setTimeout(() => window.location.href = "/", 1200);
        return;
    }
    adminUser = me.user;

    await ZB.mountHeader("header-container", "admin");
    renderAdminHeader();

    await loadStats();
    await loadUsers();

    setupSearch();
    setupRefresh();
    setupTabs();
    setupEmojiModal();
}

function renderAdminHeader() {
    const badge = document.querySelector(".admin-role-badge");
    if (!badge) return;
    if (adminUser.role === "owner") {
        badge.textContent = "👑 Владелец";
    } else if (adminUser.role === "admin") {
        badge.textContent = "⚙ Админ";
    } else {
        badge.textContent = "🛠 Разработчик";
    }
}

// ═══════════════════════════════════════════════════════════
//  СТАТИСТИКА
// ═══════════════════════════════════════════════════════════
async function loadStats() {
    const res = await ZB.get("/api/admin/stats");
    if (!res.ok) {
        ZB.toast("Ошибка статистики", "error");
        return;
    }
    const s = res.stats;
    setStat("stat-users-total", s.users_total);
    setStat("stat-users-online", s.users_online);
    setStat("stat-users-verified", s.users_verified);
    setStat("stat-users-banned", s.users_banned);
    setStat("stat-posts", s.posts_total);
    setStat("stat-messages", s.messages_total);
    setStat("stat-chats", s.chats_total);
}

function setStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = (value || 0).toLocaleString("ru-RU");
}

// ═══════════════════════════════════════════════════════════
//  ПОЛЬЗОВАТЕЛИ
// ═══════════════════════════════════════════════════════════
async function loadUsers() {
    const url = `/api/admin/users?q=${encodeURIComponent(currentQuery)}&limit=${PAGE_SIZE}&offset=${currentOffset}`;
    const res = await ZB.get(url);
    const list = document.getElementById("users-list");
    if (!list) return;

    if (!res.ok) {
        list.innerHTML = `<div class="admin-empty">Ошибка: ${ZB.escapeHtml(res.error || "?")}</div>`;
        return;
    }

    currentUsers = res.users || [];
    if (!currentUsers.length) {
        list.innerHTML = `<div class="admin-empty">Никого не найдено</div>`;
        return;
    }

    list.innerHTML = currentUsers.map(u => renderUserRow(u)).join("");
    attachUserActions();
}

function renderUserRow(u) {
    const isMe = adminUser && u.id === adminUser.id;
    const isOwner = u.role === "owner";
    const isAdmin = u.role === "admin";
    const isBanned = u.banned;

    const roleBadge =
        u.role === "owner" ? `<span class="role-badge role-owner">👑 Владелец</span>` :
        u.role === "admin" ? `<span class="role-badge role-admin">⚙ Админ</span>` :
        `<span class="role-badge role-user">Пользователь</span>`;

    const bannedBadge = isBanned ? `<span class="role-badge role-banned">🚫 Забанен</span>` : "";
    const verifiedBadge = u.verified ? `<span class="role-badge role-verified">✓ Верифицирован</span>` : "";

    return `
        <div class="user-row ${isBanned ? "is-banned" : ""}" data-user-id="${u.id}">
            <div class="user-row-left">
                ${ZB.renderAvatar(u, "avatar-lg", u.online)}
                <div class="user-row-info">
                    <div class="user-row-name">
                        ${ZB.escapeHtml(u.display || u.username)}
                        ${u.verified ? ZB.verifiedBadge(true) : ""}
                        ${roleBadge}
                        ${verifiedBadge}
                        ${bannedBadge}
                    </div>
                    <div class="user-row-username">@${ZB.escapeHtml(u.username)}</div>
                    <div class="user-row-email">${ZB.escapeHtml(u.email || "")}</div>
                    <div class="user-row-meta">
                        ID: ${u.id} ·
                        Создан: ${ZB.formatDate(u.created_at)} ·
                        ${u.online ? "🟢 онлайн" : "⚫ " + ZB.formatTime(u.last_seen)}
                    </div>
                    ${isBanned && u.banned_reason ? `<div class="user-row-ban-reason">Причина: ${ZB.escapeHtml(u.banned_reason)}</div>` : ""}
                </div>
            </div>
            <div class="user-row-actions">
                ${renderActions(u, isMe, isOwner, isAdmin, isBanned)}
            </div>
        </div>
    `;
}

function renderActions(u, isMe, isOwner, isAdmin, isBanned) {
    if (isMe) return `<span class="user-action-note">Это ты</span>`;
    if (isOwner) return `<span class="user-action-note">👑 Владелец</span>`;

    const btns = [];

    // Эмодзи (для админов)
    btns.push(`<button class="admin-btn admin-btn-emoji" data-action="emoji" data-uid="${u.id}" title="Сменить эмодзи">🎨 Эмодзи</button>`);

    // Верификация
    if (u.verified) {
        const canUnverify = !(isAdmin && adminUser.role !== "owner");
        if (canUnverify) {
            btns.push(`<button class="admin-btn admin-btn-warning" data-action="unverify" data-uid="${u.id}">🚫 Снять ✓</button>`);
        }
    } else {
        btns.push(`<button class="admin-btn admin-btn-success" data-action="verify" data-uid="${u.id}">✓ Верифицировать</button>`);
    }

    // Бан
    if (isBanned) {
        btns.push(`<button class="admin-btn admin-btn-success" data-action="unban" data-uid="${u.id}">🔓 Разбанить</button>`);
    } else {
        const canBan = !(isAdmin && adminUser.role !== "owner");
        if (canBan) {
            btns.push(`<button class="admin-btn admin-btn-danger" data-action="ban" data-uid="${u.id}">🚫 Забанить</button>`);
        }
    }

    // Админ (только owner)
    if (adminUser.role === "owner") {
        if (isAdmin) {
            btns.push(`<button class="admin-btn admin-btn-warning" data-action="remove_admin" data-uid="${u.id}">↓ Снять админа</button>`);
        } else {
            btns.push(`<button class="admin-btn" data-action="make_admin" data-uid="${u.id}">⚙ Сделать админом</button>`);
        }
    }

    return btns.join("");
}

// ═══════════════════════════════════════════════════════════
//  ДЕЙСТВИЯ
// ═══════════════════════════════════════════════════════════
function attachUserActions() {
    document.querySelectorAll("[data-action]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            const uid = parseInt(btn.dataset.uid);
            if (!uid || !action) return;
            const user = currentUsers.find(u => u.id === uid);
            if (!user) return;

            if (action === "emoji") {
                openEmojiModal(user);
                return;
            }

            await doAction(action, user, btn);
        });
    });
}

async function doAction(action, user, btn) {
    if (action === "ban") {
        const reason = prompt(`Забанить @${user.username}?\nПричина:`, "нарушение правил");
        if (reason === null) return;
        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = "...";
        const res = await ZB.post("/api/admin/ban", {
            user_id: user.id,
            reason: reason || "нарушение правил",
        });
        if (res.ok) {
            ZB.toast(`@${user.username} забанен`, "success");
            await loadUsers();
            await loadStats();
        } else {
            ZB.toast(res.error || "Ошибка", "error");
            btn.disabled = false;
            btn.textContent = old;
        }
        return;
    }

    if (action === "remove_admin") {
        if (!confirm(`Снять роль админа с @${user.username}?`)) return;
    }

    const endpoints = {
        "verify":       { url: "/api/admin/verify", body: { user_id: user.id, value: 1 } },
        "unverify":     { url: "/api/admin/verify", body: { user_id: user.id, value: 0 } },
        "unban":        { url: "/api/admin/unban", body: { user_id: user.id } },
        "make_admin":   { url: "/api/admin/make_admin", body: { user_id: user.id } },
        "remove_admin": { url: "/api/admin/remove_admin", body: { user_id: user.id } },
    };

    const ep = endpoints[action];
    if (!ep) return;

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = "...";

    const res = await ZB.post(ep.url, ep.body);
    if (res.ok) {
        const messages = {
            "verify":       `@${user.username} верифицирован ✓`,
            "unverify":     `У @${user.username} снята верификация`,
            "unban":        `@${user.username} разбанен`,
            "make_admin":   `@${user.username} теперь админ`,
            "remove_admin": `@${user.username} больше не админ`,
        };
        ZB.toast(messages[action] || "Готово", "success");
        await loadUsers();
        await loadStats();
    } else {
        ZB.toast(res.error || "Ошибка", "error");
        btn.disabled = false;
        btn.textContent = oldText;
    }
}

// ═══════════════════════════════════════════════════════════
//  ⭐ МОДАЛКА СМЕНЫ ЭМОДЗИ
// ═══════════════════════════════════════════════════════════
function setupEmojiModal() {
    const modal = document.getElementById("emoji-modal");
    if (!modal) return;

    document.querySelectorAll("[data-close-emoji]").forEach(btn => {
        btn.addEventListener("click", closeEmojiModal);
    });

    modal.addEventListener("click", (e) => {
        if (e.target.id === "emoji-modal") closeEmojiModal();
    });

    const saveBtn = document.getElementById("emoji-save-btn");
    if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
            if (!emojiPickerUserId || !emojiPickerSelected) {
                ZB.toast("Выбери эмодзи", "error");
                return;
            }
            saveBtn.disabled = true;
            saveBtn.textContent = "Сохранение...";
            const res = await ZB.setEmoji(emojiPickerSelected, emojiPickerUserId);
            if (res.ok) {
                ZB.toast(`Эмодзи установлен: ${emojiPickerSelected}`, "success");
                closeEmojiModal();
                await loadUsers();
            } else {
                ZB.toast(res.error || "Ошибка", "error");
                saveBtn.disabled = false;
                saveBtn.textContent = "Сохранить";
            }
        });
    }
}

async function openEmojiModal(user) {
    emojiPickerUserId = user.id;
    emojiPickerSelected = user.emoji || "🐱";

    const modal = document.getElementById("emoji-modal");
    if (!modal) {
        ZB.toast("Модалка не найдена", "error");
        return;
    }

    // Заголовок
    const titleEl = document.getElementById("emoji-modal-user");
    if (titleEl) {
        titleEl.innerHTML = `
            ${ZB.renderAvatar(user, "avatar-sm")}
            <span>@${ZB.escapeHtml(user.username)}</span>
        `;
    }

    // Показываем превью текущего
    const previewEl = document.getElementById("emoji-current-preview");
    if (previewEl) {
        previewEl.textContent = emojiPickerSelected;
    }

    // Строим пикер
    const picker = document.getElementById("admin-emoji-picker");
    if (picker) {
        await ZB.buildEmojiPicker(picker, emojiPickerSelected, (emoji) => {
            emojiPickerSelected = emoji;
            if (previewEl) previewEl.textContent = emoji;
        });
    }

    modal.classList.remove("hidden");
}

function closeEmojiModal() {
    const modal = document.getElementById("emoji-modal");
    if (modal) modal.classList.add("hidden");
    emojiPickerUserId = null;
    emojiPickerSelected = null;
}

// ═══════════════════════════════════════════════════════════
//  ПОИСК
// ═══════════════════════════════════════════════════════════
function setupSearch() {
    const input = document.getElementById("admin-search");
    if (!input) return;
    let timer = null;
    input.addEventListener("input", () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
            currentQuery = input.value.trim();
            currentOffset = 0;
            await loadUsers();
        }, 350);
    });
}

// ═══════════════════════════════════════════════════════════
//  ОБНОВИТЬ
// ═══════════════════════════════════════════════════════════
function setupRefresh() {
    const btn = document.getElementById("admin-refresh");
    if (!btn) return;
    btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "⏳";
        await loadStats();
        await loadUsers();
        btn.disabled = false;
        btn.textContent = "🔄 Обновить";
        ZB.toast("Данные обновлены", "success");
    });
}

// ═══════════════════════════════════════════════════════════
//  ТАБЫ
// ═══════════════════════════════════════════════════════════
function setupTabs() {
    document.querySelectorAll(".admin-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const id = tab.dataset.tab;
            document.querySelectorAll(".admin-tab").forEach(t =>
                t.classList.toggle("active", t === tab));
            document.querySelectorAll(".admin-tab-content").forEach(c =>
                c.classList.toggle("active", c.id === "tab-" + id));

            if (id === "log" && !logLoaded) {
                loadAdminLog();
                logLoaded = true;
            }
        });
    });
}

async function loadAdminLog() {
    if (adminUser.role !== "owner") {
        const logList = document.getElementById("admin-log-list");
        if (logList) logList.innerHTML = `<div class="admin-empty">Только владелец видит журнал</div>`;
        return;
    }
    const res = await ZB.get("/api/admin/log");
    const list = document.getElementById("admin-log-list");
    if (!list) return;

    if (!res.ok || !res.log || !res.log.length) {
        list.innerHTML = `<div class="admin-empty">Журнал пуст</div>`;
        return;
    }

    list.innerHTML = res.log.map(l => `
        <div class="log-row">
            <div class="log-time">${ZB.formatDate(l.created_at)}</div>
            <div class="log-admin">${ZB.escapeHtml(l.admin_display || l.admin_username)}</div>
            <div class="log-action">${ZB.escapeHtml(l.action)}</div>
            <div class="log-details">${ZB.escapeHtml(l.details || "")} ${l.target_id ? "(#" + l.target_id + ")" : ""}</div>
        </div>
    `).join("");
}

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", initAdmin);