// ═══════════════════════════════════════════════════════════
//  ZVENOBACK — Лента v4.0 (эмодзи-аватарки)
// ═══════════════════════════════════════════════════════════

let currentUser = null;
let posts = [];
let offset = 0;
const LIMIT = 20;
let postImageFile = null;
let currentCommentsPostId = null;

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
async function initFeed() {
    currentUser = await ZB.checkAuth(true);
    if (!currentUser) return;

    await ZB.mountHeader("header-container", "index");
    await renderMiniProfile();
    await renderPostFormAvatar();
    await loadPosts(true);

    setupPostForm();
    setupFeedSearch();
    setupCommentsModal();
    setupLoadMore();
}

// ═══════════════════════════════════════════════════════════
//  МИНИ-ПРОФИЛЬ
// ═══════════════════════════════════════════════════════════
async function renderMiniProfile() {
    const el = document.getElementById("profile-mini");
    if (!el) return;

    const res = await ZB.get(`/api/user/${currentUser.id}`);
    if (!res.ok) {
        el.innerHTML = `<div class="profile-mini-loading">Ошибка</div>`;
        return;
    }
    const u = res.user;

    const avatarInner = u.avatar
        ? `<img src="${ZB.avatarUrl(u.avatar)}" alt="">`
        : ZB.escapeHtml(u.emoji || "🐱");

    el.innerHTML = `
        <a href="${ZB.profileUrl(u.username)}" class="profile-mini-avatar">
            <div class="avatar avatar-xl">${avatarInner}</div>
        </a>
        <div class="profile-mini-name">${ZB.renderName(u)}</div>
        <div class="profile-mini-login">@${ZB.escapeHtml(u.username)}</div>
        ${u.bio ? `<div class="profile-mini-bio">${ZB.escapeHtml(u.bio)}</div>` : ""}
        <a href="/settings" class="profile-mini-edit">Редактировать профиль</a>
    `;

    const pc = document.getElementById("my-posts-count");
    const lc = document.getElementById("my-likes-count");
    const fc = document.getElementById("my-friends-count");
    if (pc) pc.textContent = u.posts_count || 0;
    if (lc) lc.textContent = u.likes_received || 0;
    if (fc) fc.textContent = u.friends_count || 0;
}

function renderPostFormAvatar() {
    const el = document.getElementById("post-form-avatar");
    if (el) el.innerHTML = ZB.renderAvatar(currentUser, "avatar");
    const el2 = document.getElementById("comments-form-avatar");
    if (el2) el2.innerHTML = ZB.renderAvatar(currentUser, "avatar-sm");
}

// ═══════════════════════════════════════════════════════════
//  ЗАГРУЗКА ПОСТОВ
// ═══════════════════════════════════════════════════════════
async function loadPosts(reset = false) {
    const feed = document.getElementById("feed-posts");
    if (!feed) return;

    if (reset) {
        offset = 0;
        posts = [];
        feed.innerHTML = `<div class="feed-loading"><div class="spinner"></div><div>Загрузка...</div></div>`;
    }

    const res = await ZB.get(`/api/posts?limit=${LIMIT}&offset=${offset}`);
    if (!res.ok) {
        feed.innerHTML = `<div class="feed-empty">Ошибка: ${ZB.escapeHtml(res.error || "?")}</div>`;
        return;
    }

    const newPosts = res.posts || [];

    if (reset) {
        posts = newPosts;
        feed.innerHTML = "";
    } else {
        posts = posts.concat(newPosts);
    }

    if (!posts.length) {
        feed.innerHTML = `
            <div class="feed-empty">
                <div class="feed-empty-icon">📭</div>
                <div>Пока нет постов. Напиши первый!</div>
            </div>
        `;
        const more = document.getElementById("feed-more");
        if (more) more.classList.add("hidden");
        return;
    }

    if (reset) {
        feed.innerHTML = posts.map(renderPost).join("");
    } else {
        const start = posts.length - newPosts.length;
        feed.insertAdjacentHTML("beforeend", posts.slice(start).map(renderPost).join(""));
    }

    attachPostActions();

    const more = document.getElementById("feed-more");
    if (more) {
        if (newPosts.length === LIMIT) {
            more.classList.remove("hidden");
        } else {
            more.classList.add("hidden");
        }
    }
}

// ═══════════════════════════════════════════════════════════
//  РЕНДЕР ПОСТА
// ═══════════════════════════════════════════════════════════
function renderPost(p) {
    const isOwn = currentUser && p.user_id === currentUser.id;
    const imageUrl = p.image ? `/uploads/posts/${p.image}` : null;

    return `
        <article class="post" data-post-id="${p.id}">
            <div class="post-header">
                <a href="${ZB.profileUrl(p.username)}" class="post-avatar">
                    ${ZB.renderAvatar({
                        username: p.username, display: p.display,
                        avatar: p.avatar, emoji: p.emoji,
                    }, "avatar")}
                </a>
                <div class="post-author">
                    <a href="${ZB.profileUrl(p.username)}" class="post-author-name">
                        ${ZB.escapeHtml(p.display || p.username)}
                        ${p.verified ? ZB.verifiedBadge(true) : ""}
                    </a>
                    <div class="post-time">${ZB.formatTime(p.created_at)}</div>
                </div>
                ${isOwn ? `<button class="post-menu" data-post-delete="${p.id}" title="Удалить">🗑</button>` : ""}
            </div>

            ${p.text ? `<div class="post-text">${linkify(ZB.escapeHtml(p.text))}</div>` : ""}

            ${imageUrl ? `
                <div class="post-image">
                    <img src="${imageUrl}" alt="" loading="lazy">
                </div>
            ` : ""}

            <div class="post-actions">
                <button class="post-action-btn ${p.liked ? "liked" : ""}"
                        data-action="like" data-post-id="${p.id}">
                    <span class="post-action-icon">${p.liked ? "❤️" : "🤍"}</span>
                    <span class="post-action-count" data-like-count>${p.likes_count}</span>
                </button>
                <button class="post-action-btn" data-action="comments" data-post-id="${p.id}">
                    <span class="post-action-icon">💬</span>
                    <span class="post-action-count">${p.comments_count}</span>
                </button>
                <button class="post-action-btn" data-action="share" data-post-id="${p.id}">
                    <span class="post-action-icon">🔗</span>
                </button>
            </div>
        </article>
    `;
}

function linkify(html) {
    html = html.replace(/@([a-zA-Z0-9_]{3,20})/g,
        '<a href="/u/$1" class="post-mention">@$1</a>');
    return html;
}

// ═══════════════════════════════════════════════════════════
//  ДЕЙСТВИЯ ПОСТОВ
// ═══════════════════════════════════════════════════════════
function attachPostActions() {
    document.querySelectorAll("[data-action]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            const postId = parseInt(btn.dataset.postId);

            if (action === "like") await toggleLike(postId, btn);
            else if (action === "comments") openComments(postId);
            else if (action === "share") sharePost(postId);
        });
    });

    document.querySelectorAll("[data-post-delete]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const postId = parseInt(btn.dataset.postDelete);
            await deletePost(postId);
        });
    });
}

async function toggleLike(postId, btn) {
    const res = await ZB.post("/api/like", { post_id: postId });
    if (!res.ok) {
        ZB.toast("Ошибка лайка", "error");
        return;
    }
    const post = posts.find(p => p.id === postId);
    if (post) {
        post.liked = res.liked;
        post.likes_count = res.count;
    }
    btn.classList.toggle("liked", res.liked);
    btn.querySelector(".post-action-icon").textContent = res.liked ? "❤️" : "🤍";
    btn.querySelector("[data-like-count]").textContent = res.count;

    btn.style.transform = "scale(1.15)";
    setTimeout(() => { btn.style.transform = ""; }, 150);
}

async function deletePost(postId) {
    if (!confirm("Удалить этот пост?")) return;
    const res = await ZB.post("/api/admin/delete_post", { post_id: postId });
    if (res.ok) {
        ZB.toast("Пост удалён", "success");
        posts = posts.filter(p => p.id !== postId);
        const el = document.querySelector(`[data-post-id="${postId}"]`);
        if (el) el.remove();
    } else {
        ZB.toast(res.error || "Нельзя удалить", "error");
    }
}

function sharePost(postId) {
    const url = `${window.location.origin}/u/${currentUser.username}`;
    navigator.clipboard.writeText(url).then(() => {
        ZB.toast("Ссылка скопирована", "success");
    }).catch(() => {
        ZB.toast("Ссылка: " + url, "info");
    });
}

// ═══════════════════════════════════════════════════════════
//  ФОРМА ПОСТА
// ═══════════════════════════════════════════════════════════
function setupPostForm() {
    const text = document.getElementById("post-text");
    const submit = document.getElementById("post-submit");
    const imageInput = document.getElementById("post-image-input");
    const preview = document.getElementById("post-image-preview");
    const previewImg = document.getElementById("post-image-preview-img");
    const removeBtn = document.getElementById("post-image-remove");

    if (!text || !submit) return;

    const updateSubmit = () => {
        const hasText = text.value.trim().length > 0;
        const hasImage = !!postImageFile;
        submit.disabled = !hasText && !hasImage;
    };

    text.addEventListener("input", () => {
        updateSubmit();
        text.style.height = "auto";
        text.style.height = Math.min(text.scrollHeight, 300) + "px";
    });

    if (imageInput) {
        imageInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) {
                ZB.toast("Максимум 10 МБ", "error");
                return;
            }
            postImageFile = file;
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (previewImg) previewImg.src = ev.target.result;
                if (preview) preview.classList.remove("hidden");
            };
            reader.readAsDataURL(file);
            updateSubmit();
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            postImageFile = null;
            if (imageInput) imageInput.value = "";
            if (preview) preview.classList.add("hidden");
            if (previewImg) previewImg.src = "";
            updateSubmit();
        });
    }

    submit.addEventListener("click", submitPost);
}

async function submitPost() {
    const text = document.getElementById("post-text");
    const submit = document.getElementById("post-submit");

    submit.disabled = true;
    submit.textContent = "Отправка...";

    try {
        const fd = new FormData();
        if (text.value.trim()) fd.append("text", text.value.trim());
        if (postImageFile) fd.append("image", postImageFile);

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

        // Сброс
        text.value = "";
        text.style.height = "auto";
        postImageFile = null;
        const imageInput = document.getElementById("post-image-input");
        if (imageInput) imageInput.value = "";
        const preview = document.getElementById("post-image-preview");
        if (preview) preview.classList.add("hidden");
        const previewImg = document.getElementById("post-image-preview-img");
        if (previewImg) previewImg.src = "";

        submit.textContent = "Опубликовать";
        submit.disabled = true;

        await loadPosts(true);
        await renderMiniProfile();
    } catch (e) {
        console.error(e);
        ZB.toast("Сеть недоступна", "error");
        submit.disabled = false;
        submit.textContent = "Опубликовать";
    }
}

// ═══════════════════════════════════════════════════════════
//  ЗАГРУЗИТЬ ЕЩЁ
// ═══════════════════════════════════════════════════════════
function setupLoadMore() {
    const btn = document.getElementById("btn-load-more");
    if (!btn) return;
    btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Загрузка...";
        offset += LIMIT;
        await loadPosts(false);
        btn.disabled = false;
        btn.textContent = "Загрузить ещё";
    });
}

// ═══════════════════════════════════════════════════════════
//  КОММЕНТАРИИ
// ═══════════════════════════════════════════════════════════
function setupCommentsModal() {
    document.querySelectorAll("[data-close-modal]").forEach(btn => {
        btn.addEventListener("click", () => {
            const m = document.getElementById("comments-modal");
            if (m) m.classList.add("hidden");
            currentCommentsPostId = null;
        });
    });

    const modal = document.getElementById("comments-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target.id === "comments-modal") {
                modal.classList.add("hidden");
                currentCommentsPostId = null;
            }
        });
    }

    const input = document.getElementById("comment-input");
    if (input) {
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                submitComment();
            }
        });
    }
    const cbtn = document.getElementById("comment-submit");
    if (cbtn) cbtn.addEventListener("click", submitComment);
}

async function openComments(postId) {
    currentCommentsPostId = postId;
    const modal = document.getElementById("comments-modal");
    const list = document.getElementById("comments-list");

    if (!modal || !list) return;

    modal.classList.remove("hidden");
    list.innerHTML = `<div class="feed-loading"><div class="spinner"></div></div>`;

    const input = document.getElementById("comment-input");
    if (input) {
        input.value = "";
        input.focus();
    }

    const res = await ZB.get(`/api/post/${postId}`);
    if (!res.ok) {
        list.innerHTML = `<div class="feed-empty">Ошибка</div>`;
        return;
    }

    const comments = res.post.comments || [];
    if (!comments.length) {
        list.innerHTML = `<div class="comments-empty">Пока нет комментариев. Будь первым!</div>`;
        return;
    }

    list.innerHTML = comments.map(c => `
        <div class="comment">
            ${ZB.renderAvatar(c, "avatar-sm")}
            <div class="comment-body">
                <div class="comment-header">
                    <a href="${ZB.profileUrl(c.username)}" class="comment-author">
                        ${ZB.renderName(c)}
                    </a>
                    <span class="comment-time">${ZB.formatTime(c.created_at)}</span>
                </div>
                <div class="comment-text">${ZB.escapeHtml(c.text)}</div>
            </div>
        </div>
    `).join("");
}

async function submitComment() {
    if (!currentCommentsPostId) return;
    const input = document.getElementById("comment-input");
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    input.disabled = true;

    const res = await ZB.post("/api/comment", {
        post_id: currentCommentsPostId,
        text: text,
    });

    input.disabled = false;

    if (!res.ok) {
        ZB.toast(res.error || "Ошибка", "error");
        return;
    }

    input.value = "";
    await openComments(currentCommentsPostId);

    const post = posts.find(p => p.id === currentCommentsPostId);
    if (post) {
        post.comments_count += 1;
        const el = document.querySelector(`[data-post-id="${currentCommentsPostId}"] [data-action="comments"] .post-action-count`);
        if (el) el.textContent = post.comments_count;
    }
}

// ═══════════════════════════════════════════════════════════
//  ПОИСК
// ═══════════════════════════════════════════════════════════
function setupFeedSearch() {
    const input = document.getElementById("feed-search");
    const results = document.getElementById("feed-search-results");
    if (!input || !results) return;

    let timer = null;
    input.addEventListener("input", () => {
        if (timer) clearTimeout(timer);
        const q = input.value.trim();
        if (!q) {
            results.classList.add("hidden");
            return;
        }
        timer = setTimeout(async () => {
            const res = await ZB.get(`/api/search?q=${encodeURIComponent(q)}`);
            if (!res.ok || !res.users.length) {
                results.innerHTML = `<div class="search-empty">Никого не найдено</div>`;
                results.classList.remove("hidden");
                return;
            }
            results.innerHTML = res.users.map(u => `
                <a href="${ZB.profileUrl(u.username)}" class="search-result">
                    ${ZB.renderAvatar(u, "avatar-sm")}
                    <div class="search-result-info">
                        <div class="search-result-name">${ZB.renderName(u)}</div>
                        <div class="search-result-username">@${ZB.escapeHtml(u.username)}</div>
                    </div>
                </a>
            `).join("");
            results.classList.remove("hidden");
        }, 350);
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".sidebar-search")) {
            results.classList.add("hidden");
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", initFeed);