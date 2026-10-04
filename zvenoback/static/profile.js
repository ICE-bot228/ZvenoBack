// ═══════════════════════════════════════════════════════════
//  ZVENOBACK — Профиль v4.0 (эмодзи-пикер)
// ═══════════════════════════════════════════════════════════

let me = null;
let profileUser = null;
let isSelf = false;
let posts = [];
let offset = 0;
const LIMIT = 10;
let profilePostImage = null;
let friendshipStatus = null;
let editModalSetup = false;
let selectedEmoji = "🐱";

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
async function initProfile() {
    me = await ZB.checkAuth(true);
    if (!me) return;

    const path = window.location.pathname;
    let username = null;
    if (path.startsWith("/u/")) {
        username = decodeURIComponent(path.slice(3));
    } else if (path === "/profile") {
        username = me.username;
    }

    if (!username) {
        window.location.href = `/u/${me.username}`;
        return;
    }

    // Находим ID
    let userId = null;
    if (username === me.username) {
        userId = me.id;
    } else {
        const searchRes = await ZB.get(`/api/search?q=${encodeURIComponent(username)}`);
        if (searchRes.ok) {
            const found = searchRes.users.find(u => u.username === username);
            if (found) userId = found.id;
        }
    }

    if (!userId) {
        document.getElementById("profile-header").innerHTML = `
            <div class="profile-loading">
                <div class="feed-empty-icon">🔍</div>
                <div>Пользователь @${ZB.escapeHtml(username)} не найден</div>
            </div>
        `;
        await ZB.mountHeader("header-container", "profile");
        return;
    }

    isSelf = (userId === me.id);

    const res = await ZB.get(`/api/user/${userId}`);
    if (!res.ok) {
        ZB.toast("Ошибка загрузки профиля", "error");
        return;
    }
    profileUser = res.user;
    selectedEmoji = profileUser.emoji || "🐱";

    await ZB.mountHeader("header-container", isSelf ? "profile" : "");

    renderProfileHeader();
    setupProfileTabs();
    setupEditModal();
    setupLoadMore();

    await loadProfilePosts(true);
}

// ═══════════════════════════════════════════════════════════
//  ШАПКА ПРОФИЛЯ
// ═══════════════════════════════════════════════════════════
function renderProfileHeader() {
    const el = document.getElementById("profile-header");
    if (!el) return;
    const u = profileUser;

    const avatarInner = u.avatar
        ? `<img src="${ZB.avatarUrl(u.avatar)}" alt="">`
        : ZB.escapeHtml(u.emoji || "🐱");

    let actionsHtml = "";
    if (isSelf) {
        actionsHtml = `<button class="btn btn-secondary" id="edit-profile-btn">✏ Редактировать</button>`;
    } else {
        actionsHtml = `
            <div id="friendship-actions">${renderFriendshipButton()}</div>
            <button class="btn btn-secondary" id="message-user-btn">💬 Написать</button>
        `;
    }

    const roleBadge =
        u.role === "owner" ? `<span class="profile-badge profile-owner">👑 Владелец ZvenoBack</span>` :
        u.role === "admin" ? `<span class="profile-badge profile-admin">⚙ Администратор</span>` : "";

    const onlineStatus = u.online
        ? `<span class="profile-status online">🟢 онлайн</span>`
        : `<span class="profile-status">⚫ был(а) ${ZB.formatTime(u.last_seen)}</span>`;

    el.innerHTML = `
        <div class="profile-header-inner">
            <div class="profile-avatar-big">
                <div class="avatar avatar-xl">
                    ${avatarInner}
                    ${u.online ? `<span class="online-dot"></span>` : ""}
                </div>
            </div>
            <div class="profile-info">
                <div class="profile-name">
                    ${ZB.escapeHtml(u.display || u.username)}
                    ${u.verified ? ZB.verifiedBadge(true) : ""}
                </div>
                <div class="profile-login">@${ZB.escapeHtml(u.username)}</div>
                <div class="profile-badges">
                    ${roleBadge}
                    ${onlineStatus}
                </div>
                ${u.bio ? `<div class="profile-bio">${ZB.escapeHtml(u.bio)}</div>` : ""}
                <div class="profile-actions">${actionsHtml}</div>
            </div>
        </div>

        <div class="profile-stats-row">
            <div class="profile-stat">
                <div class="profile-stat-value">${u.posts_count || 0}</div>
                <div class="profile-stat-label">постов</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-value">${u.likes_received || 0}</div>
                <div class="profile-stat-label">лайков</div>
            </div>
            <div class="profile-stat">
                <div class="profile-stat-value">${u.friends_count || 0}</div>
                <div class="profile-stat-label">друзей</div>
            </div>
        </div>

        <div class="profile-meta">
            <span>📅 Зарегистрирован: ${ZB.formatDate(u.created_at)}</span>
            <span>🆔 ID: ${u.id}</span>
        </div>
    `;

    if (isSelf) {
        const btn = document.getElementById("edit-profile-btn");
        if (btn) btn.addEventListener("click", openEditModal);
    } else {
        setupFriendshipActions();
        const msgBtn = document.getElementById("message-user-btn");
        if (msgBtn) msgBtn.addEventListener("click", () => {
            window.location.href = `/chats?user=${profileUser.id}`;
        });
    }
}

// ═══════════════════════════════════════════════════════════
//  ДРУЖБА
// ═══════════════════════════════════════════════════════════
function renderFriendshipButton() {
    if (friendshipStatus === "accepted") {
        return `<button class="btn btn-success" id="friendship-btn" data-action="remove">✓ В друзьях</button>`;
    }
    if (friendshipStatus === "pending") {
        return `<button class="btn btn-secondary" id="friendship-btn" data-action="remove">⏳ Заявка отправлена</button>`;
    }
    if (friendshipStatus === "incoming") {
        return `<button class="btn btn-success" id="friendship-btn" data-action="accept">✓ Принять заявку</button>`;
    }
    return `<button class="btn" id="friendship-btn" data-action="add">+ Добавить в друзья</button>`;
}

async function setupFriendshipActions() {
    if (isSelf) return;

    const res = await ZB.get("/api/friends");
    if (res.ok) {
        if (res.friends && res.friends.some(f => f.id === profileUser.id)) {
            friendshipStatus = "accepted";
        } else if (res.incoming && res.incoming.some(i => i.id === profileUser.id)) {
            friendshipStatus = "incoming";
        } else {
            friendshipStatus = null;
        }
        const wrap = document.getElementById("friendship-actions");
        if (wrap) wrap.innerHTML = renderFriendshipButton();
    }

    attachFriendshipBtn();
}

function attachFriendshipBtn() {
    const btn = document.getElementById("friendship-btn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        if (!action) return;

        btn.disabled = true;
        const oldText = btn.textContent;
        btn.textContent = "...";

        const res = await ZB.post("/api/friend", {
            user_id: profileUser.id,
            action: action,
        });

        if (res.ok) {
            if (action === "add") {
                friendshipStatus = "pending";
                ZB.toast("Заявка отправлена ✓", "success");
            } else if (action === "accept") {
                friendshipStatus = "accepted";
                ZB.toast("Теперь вы друзья! 🎉", "success");
            } else if (action === "remove") {
                friendshipStatus = null;
                ZB.toast("Удалено", "success");
            }
            const wrap = document.getElementById("friendship-actions");
            if (wrap) wrap.innerHTML = renderFriendshipButton();
            attachFriendshipBtn();
        } else {
            ZB.toast(res.error || "Ошибка", "error");
            btn.disabled = false;
            btn.textContent = oldText;
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  ТАБЫ
// ═══════════════════════════════════════════════════════════
function setupProfileTabs() {
    document.querySelectorAll(".profile-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const id = tab.dataset.tab;
            document.querySelectorAll(".profile-tab").forEach(t =>
                t.classList.toggle("active", t === tab));
            document.querySelectorAll(".profile-tab-content").forEach(c =>
                c.classList.toggle("active", c.id === "tab-" + id));

            if (id === "about") renderAbout();
        });
    });
}

function renderAbout() {
    const el = document.getElementById("profile-about");
    if (!el || !profileUser) return;
    const u = profileUser;
    el.innerHTML = `
        <div class="card-title">ℹ О себе</div>
        <div class="about-row"><span>Имя:</span> <b>${ZB.escapeHtml(u.display || u.username)}</b></div>
        <div class="about-row"><span>Логин:</span> <b>@${ZB.escapeHtml(u.username)}</b></div>
        <div class="about-row"><span>Email:</span> <b>${isSelf ? ZB.escapeHtml(u.email || "") : "скрыт"}</b></div>
        <div class="about-row"><span>ID:</span> <b>${u.id}</b></div>
        <div class="about-row"><span>Роль:</span> <b>${ZB.escapeHtml(u.role)}</b></div>
        <div class="about-row"><span>Эмодзи:</span> <b style="font-size:20px;font-family:var(--font-emoji);">${ZB.escapeHtml(u.emoji || "🐱")}</b></div>
        <div class="about-row"><span>Верификация:</span> <b>${u.verified ? "✓ Да" : "Нет"}</b></div>
        <div class="about-row"><span>Регистрация:</span> <b>${ZB.formatDate(u.created_at)}</b></div>
        <div class="about-row"><span>Последний вход:</span> <b>${ZB.formatDate(u.last_seen)}</b></div>
        ${u.bio ? `<div class="about-bio">${ZB.escapeHtml(u.bio)}</div>` : ""}
    `;
}

// ═══════════════════════════════════════════════════════════
//  ПОСТЫ
// ═══════════════════════════════════════════════════════════
async function loadProfilePosts(reset = false) {
    const feed = document.getElementById("profile-posts");
    if (!feed) return;

    if (reset) {
        offset = 0;
        posts = [];
        feed.innerHTML = `<div class="feed-loading"><div class="spinner"></div></div>`;
    }

    const res = await ZB.get(`/api/posts?user_id=${profileUser.id}&limit=${LIMIT}&offset=${offset}`);
    if (!res.ok) {
        feed.innerHTML = `<div class="feed-empty">Ошибка загрузки</div>`;
        return;
    }

    const newPosts = res.posts || [];
    if (reset) {
        posts = newPosts;
        feed.innerHTML = "";
    } else {
        posts = posts.concat(newPosts);
    }

    renderPostForm();

    if (!posts.length) {
        feed.insertAdjacentHTML("beforeend", `
            <div class="feed-empty">
                <div class="feed-empty-icon">📭</div>
                <div>${isSelf ? "Напиши первый пост на своей стене!" : "Пока нет постов"}</div>
            </div>
        `);
        document.getElementById("profile-feed-more").classList.add("hidden");
        return;
    }

    if (reset) {
        feed.innerHTML = posts.map(renderProfilePost).join("");
    } else {
        const start = posts.length - newPosts.length;
        feed.insertAdjacentHTML("beforeend", posts.slice(start).map(renderProfilePost).join(""));
    }

    attachPostActions();

    const more = document.getElementById("profile-feed-more");
    if (newPosts.length === LIMIT) {
        more.classList.remove("hidden");
    } else {
        more.classList.add("hidden");
    }
}

function renderPostForm() {
    const wrap = document.getElementById("profile-post-form-wrap");
    if (!wrap) return;
    if (!isSelf) { wrap.innerHTML = ""; return; }

    wrap.innerHTML = `
        <div class="card post-form" style="margin-bottom:12px;">
            <div class="post-form-header">
                <div class="post-form-avatar">${ZB.renderAvatar(me, "avatar")}</div>
                <textarea class="post-form-input" id="profile-post-text" placeholder="Что нового?"></textarea>
            </div>
            <div class="post-image-preview hidden" id="profile-post-image-preview">
                <img id="profile-post-image-preview-img" src="" alt="">
                <button class="post-image-remove" id="profile-post-image-remove">✕</button>
            </div>
            <div class="post-form-footer">
                <div class="post-form-left">
                    <label class="post-form-attach" for="profile-post-image-input">
                        <span>📷</span><span>Фото</span>
                    </label>
                    <input type="file" id="profile-post-image-input" accept="image/*" hidden>
                </div>
                <button class="btn btn-small" id="profile-post-submit" disabled>Опубликовать</button>
            </div>
        </div>
    `;

    const text = document.getElementById("profile-post-text");
    const submit = document.getElementById("profile-post-submit");
    const imageInput = document.getElementById("profile-post-image-input");
    const preview = document.getElementById("profile-post-image-preview");
    const previewImg = document.getElementById("profile-post-image-preview-img");
    const removeBtn = document.getElementById("profile-post-image-remove");

    const updateSubmit = () => {
        const hasText = text.value.trim().length > 0;
        submit.disabled = !hasText && !profilePostImage;
    };

    text.addEventListener("input", () => {
        updateSubmit();
        text.style.height = "auto";
        text.style.height = Math.min(text.scrollHeight, 300) + "px";
    });

    imageInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            ZB.toast("Максимум 10 МБ", "error");
            return;
        }
        profilePostImage = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            previewImg.src = ev.target.result;
            preview.classList.remove("hidden");
        };
        reader.readAsDataURL(file);
        updateSubmit();
    });

    removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        profilePostImage = null;
        imageInput.value = "";
        preview.classList.add("hidden");
        previewImg.src = "";
        updateSubmit();
    });

    submit.addEventListener("click", async () => {
        const txt = text.value.trim();
        if (!txt && !profilePostImage) return;

        submit.disabled = true;
        submit.textContent = "Публикация...";

        const fd = new FormData();
        if (txt) fd.append("text", txt);
        if (profilePostImage) fd.append("image", profilePostImage);

        try {
            const res = await fetch("/api/post", {
                method: "POST",
                body: fd,
                credentials: "same-origin",
            });
            const data = await res.json();

            if (!data.ok) {
                ZB.toast(data.error || "Ошибка", "error");
                submit.disabled = false;
                submit.textContent = "Опубликовать";
                return;
            }

            ZB.toast("Пост опубликован ✓", "success");
            profilePostImage = null;
            await loadProfilePosts(true);
            await refreshProfileStats();
        } catch (e) {
            ZB.toast("Сеть недоступна", "error");
            submit.disabled = false;
            submit.textContent = "Опубликовать";
        }
    });
}

function renderProfilePost(p) {
    const isOwn = me && p.user_id === me.id;
    const imageUrl = p.image ? `/uploads/posts/${p.image}` : null;

    return `
        <article class="post" data-post-id="${p.id}">
            <div class="post-header">
                <a href="/u/${p.username}" class="post-avatar">
                    ${ZB.renderAvatar({
                        username: p.username, display: p.display,
                        avatar: p.avatar, emoji: p.emoji,
                    }, "avatar")}
                </a>
                <div class="post-author">
                    <a href="/u/${p.username}" class="post-author-name">
                        ${ZB.escapeHtml(p.display || p.username)}
                        ${p.verified ? ZB.verifiedBadge(true) : ""}
                    </a>
                    <div class="post-time">${ZB.formatTime(p.created_at)}</div>
                </div>
                ${isOwn ? `<button class="post-menu" data-post-delete="${p.id}" title="Удалить">🗑</button>` : ""}
            </div>
            ${p.text ? `<div class="post-text">${ZB.escapeHtml(p.text)}</div>` : ""}
            ${imageUrl ? `<div class="post-image"><img src="${imageUrl}" alt="" loading="lazy"></div>` : ""}
            <div class="post-actions">
                <button class="post-action-btn ${p.liked ? "liked" : ""}" data-action="like" data-post-id="${p.id}">
                    <span class="post-action-icon">${p.liked ? "❤️" : "🤍"}</span>
                    <span class="post-action-count">${p.likes_count}</span>
                </button>
                <button class="post-action-btn" data-action="comments" data-post-id="${p.id}">
                    <span class="post-action-icon">💬</span>
                    <span class="post-action-count">${p.comments_count}</span>
                </button>
            </div>
        </article>
    `;
}

function attachPostActions() {
    document.querySelectorAll("[data-action='like']").forEach(btn => {
        btn.addEventListener("click", async () => {
            const postId = parseInt(btn.dataset.postId);
            const res = await ZB.post("/api/like", { post_id: postId });
            if (!res.ok) return;
            const post = posts.find(p => p.id === postId);
            if (post) { post.liked = res.liked; post.likes_count = res.count; }
            btn.classList.toggle("liked", res.liked);
            btn.querySelector(".post-action-icon").textContent = res.liked ? "❤️" : "🤍";
            btn.querySelector(".post-action-count").textContent = res.count;
        });
    });

    document.querySelectorAll("[data-post-delete]").forEach(btn => {
        btn.addEventListener("click", async () => {
            if (!confirm("Удалить пост?")) return;
            const postId = parseInt(btn.dataset.postDelete);
            const res = await ZB.post("/api/admin/delete_post", { post_id: postId });
            if (res.ok) {
                ZB.toast("Удалён", "success");
                await loadProfilePosts(true);
                await refreshProfileStats();
            } else {
                ZB.toast(res.error || "Ошибка", "error");
            }
        });
    });

    document.querySelectorAll("[data-action='comments']").forEach(btn => {
        btn.addEventListener("click", () => {
            ZB.toast("Комментарии — скоро", "info");
        });
    });
}

async function refreshProfileStats() {
    const res = await ZB.get(`/api/user/${profileUser.id}`);
    if (res.ok) {
        profileUser = res.user;
        selectedEmoji = profileUser.emoji || "🐱";
        renderProfileHeader();
    }
}

// ═══════════════════════════════════════════════════════════
//  ЗАГРУЗИТЬ ЕЩЁ
// ═══════════════════════════════════════════════════════════
function setupLoadMore() {
    const moreBtn = document.getElementById("profile-load-more");
    if (!moreBtn) return;
    moreBtn.addEventListener("click", async () => {
        moreBtn.disabled = true;
        moreBtn.textContent = "Загрузка...";
        offset += LIMIT;
        await loadProfilePosts(false);
        moreBtn.disabled = false;
        moreBtn.textContent = "Загрузить ещё";
    });
}

// ═══════════════════════════════════════════════════════════
//  РЕДАКТИРОВАНИЕ ПРОФИЛЯ (с эмодзи-пикером)
// ═══════════════════════════════════════════════════════════
async function openEditModal() {
    const modal = document.getElementById("edit-profile-modal");
    if (!modal) return;

    modal.classList.remove("hidden");

    const displayEl = document.getElementById("edit-display");
    const bioEl = document.getElementById("edit-bio");
    const errEl = document.getElementById("edit-error");

    if (displayEl) displayEl.value = profileUser.display || "";
    if (bioEl) bioEl.value = profileUser.bio || "";
    if (errEl) errEl.textContent = "";

    // Эмодзи-пикер
    const picker = document.getElementById("edit-emoji-picker");
    if (picker) {
        selectedEmoji = profileUser.emoji || "🐱";
        await ZB.buildEmojiPicker(picker, selectedEmoji, (emoji) => {
            selectedEmoji = emoji;
        });
    }
}

function setupEditModal() {
    document.querySelectorAll("[data-close-modal]").forEach(btn => {
        btn.addEventListener("click", () => {
            const modal = document.getElementById("edit-profile-modal");
            if (modal) modal.classList.add("hidden");
        });
    });

    const modal = document.getElementById("edit-profile-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target.id === "edit-profile-modal") {
                modal.classList.add("hidden");
            }
        });
    }

    const form = document.getElementById("edit-profile-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const displayEl = document.getElementById("edit-display");
        const bioEl = document.getElementById("edit-bio");
        const errEl = document.getElementById("edit-error");
        const submit = document.getElementById("edit-submit");

        if (!displayEl || !bioEl || !errEl || !submit) return;

        const display = displayEl.value.trim();
        const bio = bioEl.value.trim();

        errEl.textContent = "";

        if (display.length > 40) {
            errEl.textContent = "Имя макс 40 символов";
            return;
        }
        if (bio.length > 300) {
            errEl.textContent = "Био макс 300 символов";
            return;
        }

        submit.disabled = true;
        submit.textContent = "Сохранение...";

        try {
            // 1. Обновляем display + bio
            const res1 = await fetch("/api/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ display, bio }),
                credentials: "same-origin",
            });
            const data1 = await res1.json();

            if (!data1.ok) {
                errEl.textContent = data1.error || "Ошибка";
                submit.disabled = false;
                submit.textContent = "Сохранить";
                return;
            }

            // 2. Обновляем эмодзи (если изменился)
            if (selectedEmoji && selectedEmoji !== profileUser.emoji) {
                const res2 = await ZB.setEmoji(selectedEmoji);
                if (!res2.ok) {
                    errEl.textContent = res2.error || "Ошибка эмодзи";
                    submit.disabled = false;
                    submit.textContent = "Сохранить";
                    return;
                }
            }

            ZB.toast("Профиль обновлён ✓", "success");

            const m = document.getElementById("edit-profile-modal");
            if (m) m.classList.add("hidden");

            await refreshProfileStats();
            await loadProfilePosts(true);

            submit.disabled = false;
            submit.textContent = "Сохранить";
        } catch (err) {
            console.error(err);
            errEl.textContent = "Ошибка: " + err.message;
            submit.disabled = false;
            submit.textContent = "Сохранить";
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", initProfile);