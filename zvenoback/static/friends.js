// ═══════════════════════════════════════════════════════════
//  ZVENOBACK — Друзья v1.0
// ═══════════════════════════════════════════════════════════

let me = null;
let friendsList = [];
let incomingList = [];
let outgoingList = [];

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
async function initFriends() {
    me = await ZB.checkAuth(true);
    if (!me) return;

    await ZB.mountHeader("header-container", "friends");

    setupTabs();
    setupSearch();

    await loadFriends();
}

// ═══════════════════════════════════════════════════════════
//  ЗАГРУЗКА
// ═══════════════════════════════════════════════════════════
async function loadFriends() {
    const res = await ZB.get("/api/friends");
    if (!res.ok) {
        ZB.toast("Ошибка загрузки друзей", "error");
        return;
    }

    friendsList = res.friends || [];
    incomingList = res.incoming || [];

    renderFriends();
    renderIncoming();
    updateStats();
}

function updateStats() {
    const fc = document.getElementById("friends-count");
    const rc = document.getElementById("requests-count");
    if (fc) fc.textContent = friendsList.length;
    if (rc) rc.textContent = incomingList.length;

    const badge = document.getElementById("badge-incoming");
    if (badge) {
        if (incomingList.length > 0) {
            badge.textContent = incomingList.length;
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    }
}

// ═══════════════════════════════════════════════════════════
//  РЕНДЕР ДРУЗЕЙ (сетка)
// ═══════════════════════════════════════════════════════════
function renderFriends() {
    const el = document.getElementById("friends-list");
    if (!el) return;

    if (!friendsList.length) {
        el.innerHTML = `
            <div class="friends-empty" style="grid-column:1/-1;">
                <div class="friends-empty-icon">👤</div>
                <div>У тебя пока нет друзей</div>
                <div style="margin-top:6px;font-size:12px;color:var(--text-dim);">
                    Используй поиск чтобы найти людей
                </div>
            </div>
        `;
        return;
    }

    el.innerHTML = friendsList.map(f => renderFriendCard(f)).join("");
    attachFriendCardActions();
}

function renderFriendCard(u) {
    return `
        <div class="friend-card" data-user-id="${u.id}">
            <a href="${ZB.profileUrl(u.username)}" class="friend-card-avatar">
                ${ZB.renderAvatar(u, "avatar-xl", u.online)}
            </a>
            <a href="${ZB.profileUrl(u.username)}" class="friend-card-name">
                ${ZB.renderName(u)}
            </a>
            <div class="friend-card-login">@${ZB.escapeHtml(u.username)}</div>
            ${u.bio ? `<div class="friend-card-bio">${ZB.escapeHtml(u.bio)}</div>` : ""}
            <div class="friend-card-actions">
                <button class="btn btn-small" data-action="message" data-uid="${u.id}">
                    💬 Написать
                </button>
                <button class="btn btn-secondary btn-small" data-action="remove" data-uid="${u.id}">
                    Удалить
                </button>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════
//  РЕНДЕР ВХОДЯЩИХ
// ═══════════════════════════════════════════════════════════
function renderIncoming() {
    const el = document.getElementById("incoming-list");
    if (!el) return;

    if (!incomingList.length) {
        el.innerHTML = `
            <div class="friends-empty">
                <div class="friends-empty-icon">📭</div>
                <div>Нет входящих заявок</div>
            </div>
        `;
        return;
    }

    el.innerHTML = incomingList.map(u => renderIncomingRow(u)).join("");
    attachIncomingActions();
}

function renderIncomingRow(u) {
    return `
        <div class="friend-row" data-user-id="${u.id}">
            <a href="${ZB.profileUrl(u.username)}" class="friend-row-avatar">
                ${ZB.renderAvatar(u, "avatar-lg", u.online)}
            </a>
            <div class="friend-row-info">
                <a href="${ZB.profileUrl(u.username)}" class="friend-row-name">
                    ${ZB.renderName(u)}
                </a>
                <div class="friend-row-login">@${ZB.escapeHtml(u.username)}</div>
            </div>
            <div class="friend-row-actions">
                <button class="btn btn-success btn-small" data-action="accept" data-uid="${u.id}">
                    ✓ Принять
                </button>
                <button class="btn btn-secondary btn-small" data-action="decline" data-uid="${u.id}">
                    ✕ Отклонить
                </button>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════
//  ДЕЙСТВИЯ
// ═══════════════════════════════════════════════════════════
function attachFriendCardActions() {
    document.querySelectorAll(".friend-card [data-action]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            const uid = parseInt(btn.dataset.uid);

            if (action === "message") {
                window.location.href = `/chats?user=${uid}`;
            } else if (action === "remove") {
                if (!confirm("Удалить из друзей?")) return;
                await friendAction("remove", uid, btn);
            }
        });
    });
}

function attachIncomingActions() {
    document.querySelectorAll("#incoming-list [data-action]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            const uid = parseInt(btn.dataset.uid);
            await friendAction(action, uid, btn);
        });
    });
}

async function friendAction(action, uid, btn) {
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = "...";

    const res = await ZB.post("/api/friend", { user_id: uid, action: action });

    if (res.ok) {
        const messages = {
            "accept":   "Теперь вы друзья! 🎉",
            "decline":  "Заявка отклонена",
            "remove":   "Удалено из друзей",
        };
        ZB.toast(messages[action] || "Готово", "success");
        await loadFriends();
    } else {
        ZB.toast(res.error || "Ошибка", "error");
        btn.disabled = false;
        btn.textContent = old;
    }
}

// ═══════════════════════════════════════════════════════════
//  ПОИСК
// ═══════════════════════════════════════════════════════════
function setupSearch() {
    const input = document.getElementById("friends-search");
    const results = document.getElementById("search-results");
    if (!input || !results) return;

    let timer = null;
    input.addEventListener("input", () => {
        if (timer) clearTimeout(timer);
        const q = input.value.trim();

        if (!q) {
            results.innerHTML = `
                <div class="friends-empty">
                    <div class="friends-empty-icon">🔍</div>
                    <div>Начни печатать чтобы найти друзей</div>
                </div>
            `;
            return;
        }

        timer = setTimeout(async () => {
            results.innerHTML = `<div class="feed-loading"><div class="spinner"></div></div>`;
            const res = await ZB.get(`/api/search?q=${encodeURIComponent(q)}`);

            if (!res.ok || !res.users.length) {
                results.innerHTML = `
                    <div class="friends-empty">
                        <div class="friends-empty-icon">🙁</div>
                        <div>Никого не найдено</div>
                    </div>
                `;
                return;
            }

            // Отфильтровываем себя
            const users = res.users.filter(u => u.id !== me.id);

            if (!users.length) {
                results.innerHTML = `
                    <div class="friends-empty">
                        <div class="friends-empty-icon">🙁</div>
                        <div>Никого не найдено</div>
                    </div>
                `;
                return;
            }

            results.innerHTML = users.map(u => renderSearchRow(u)).join("");
            attachSearchActions();
        }, 350);
    });
}

function renderSearchRow(u) {
    // Определяем статус: друг / входящая / исходящая / нет
    const isFriend = friendsList.some(f => f.id === u.id);
    const isIncoming = incomingList.some(i => i.id === u.id);

    let actionHtml = "";
    if (isFriend) {
        actionHtml = `<span class="friend-status-badge friend-status-friend">✓ В друзьях</span>`;
    } else if (isIncoming) {
        actionHtml = `
            <button class="btn btn-success btn-small" data-action="accept" data-uid="${u.id}">
                ✓ Принять
            </button>
            <button class="btn btn-secondary btn-small" data-action="decline" data-uid="${u.id}">
                ✕
            </button>
        `;
    } else {
        actionHtml = `
            <button class="btn btn-small" data-action="add" data-uid="${u.id}">
                + Добавить
            </button>
        `;
    }

    return `
        <div class="friend-row" data-user-id="${u.id}">
            <a href="${ZB.profileUrl(u.username)}" class="friend-row-avatar">
                ${ZB.renderAvatar(u, "avatar-lg", u.online)}
            </a>
            <div class="friend-row-info">
                <a href="${ZB.profileUrl(u.username)}" class="friend-row-name">
                    ${ZB.renderName(u)}
                </a>
                <div class="friend-row-login">@${ZB.escapeHtml(u.username)}</div>
                ${u.bio ? `<div class="friend-row-bio">${ZB.escapeHtml(u.bio)}</div>` : ""}
            </div>
            <div class="friend-row-actions">${actionHtml}</div>
        </div>
    `;
}

function attachSearchActions() {
    document.querySelectorAll("#search-results [data-action]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            const uid = parseInt(btn.dataset.uid);
            await friendAction(action, uid, btn);
        });
    });
}

// ═══════════════════════════════════════════════════════════
//  ТАБЫ
// ═══════════════════════════════════════════════════════════
function setupTabs() {
    document.querySelectorAll(".friends-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const id = tab.dataset.tab;
            document.querySelectorAll(".friends-tab").forEach(t =>
                t.classList.toggle("active", t === tab));
            document.querySelectorAll(".friends-tab-content").forEach(c =>
                c.classList.toggle("active", c.id === "tab-" + id));
        });
    });
}

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", initFriends);