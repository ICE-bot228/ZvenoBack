// ═══════════════════════════════════════════════════════════
//  ZVENOBACK — общие утилиты (v4.1 — с кнопкой выхода)
// ═══════════════════════════════════════════════════════════

const ZB = {
    // ─── API ───
    async api(path, options = {}) {
        const opts = { credentials: "same-origin", ...options };
        if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
            opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
            opts.body = JSON.stringify(opts.body);
        }
        try {
            const res = await fetch(path, opts);
            const data = await res.json();
            return data;
        } catch (e) {
            console.error("API error:", e);
            return { ok: false, error: "Сеть недоступна" };
        }
    },

    get(path) { return this.api(path, { method: "GET" }); },
    post(path, body) { return this.api(path, { method: "POST", body }); },

    // ─── Тосты ───
    toast(text, type = "info", duration = 3000) {
        let container = document.querySelector(".toast-container");
        if (!container) {
            container = document.createElement("div");
            container.className = "toast-container";
            document.body.appendChild(container);
        }
        const el = document.createElement("div");
        el.className = `toast ${type}`;
        el.textContent = text;
        container.appendChild(el);
        setTimeout(() => {
            el.style.transition = "all 0.3s";
            el.style.transform = "translateX(400px)";
            el.style.opacity = "0";
            setTimeout(() => el.remove(), 300);
        }, duration);
    },

    // ─── Время ───
    formatTime(timestamp) {
        if (!timestamp) return "";
        const now = Date.now() / 1000;
        const diff = now - timestamp;
        if (diff < 5) return "только что";
        if (diff < 60) return `${Math.floor(diff)} сек назад`;
        if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
        if (diff < 604800) return `${Math.floor(diff / 86400)} дн назад`;
        const d = new Date(timestamp * 1000);
        return d.toLocaleDateString("ru-RU") + " " +
               d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    },

    formatDate(timestamp) {
        if (!timestamp) return "";
        const d = new Date(timestamp * 1000);
        return d.toLocaleString("ru-RU", {
            day: "numeric", month: "long", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    },

    formatTimeShort(timestamp) {
        if (!timestamp) return "";
        const d = new Date(timestamp * 1000);
        const now = new Date();
        if (d.toDateString() === now.toDateString())
            return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    },

    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text == null ? "" : String(text);
        return div.innerHTML;
    },

    // ═══════════════════════════════════════════════════════
    //  DISPLAY + ВЕРИФИКАЦИЯ
    // ═══════════════════════════════════════════════════════

    displayName(user) {
        if (!user) return "???";
        return user.display || user.username || "???";
    },

    loginName(user) {
        if (!user) return "";
        return user.username || "";
    },

    verifiedBadge(verified) {
        if (!verified) return "";
        return `<span class="verified-badge" title="Верифицирован">
            <svg viewBox="0 0 24 24" width="14" height="14">
                <circle cx="12" cy="12" r="11" fill="#0078ff"/>
                <path d="M6.5 12.5 L10.5 16 L17.5 8.5"
                      stroke="white" stroke-width="2.5" fill="none"
                      stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </span>`;
    },

    renderName(user) {
        const name = this.escapeHtml(this.displayName(user));
        const badge = this.verifiedBadge(user.verified);
        return `${name}${badge}`;
    },

    // ═══════════════════════════════════════════════════════
    //  АВАТАР (ЭМОДЗИ)
    // ═══════════════════════════════════════════════════════

    avatarUrl(avatar) {
        if (!avatar) return null;
        return `/uploads/avatars/${avatar}`;
    },

    avatarEmoji(user) {
        if (!user) return "🐱";
        return user.emoji || "🐱";
    },

    avatarLetter(user) {
        const name = this.displayName(user);
        return name.charAt(0).toUpperCase();
    },

    renderAvatar(user, size = "", isOnline = false) {
        if (!user) user = {};
        const cls = `avatar ${size}`;
        const onlineDot = isOnline ? `<span class="online-dot"></span>` : "";

        if (user.avatar) {
            return `<div class="${cls}">
                <img src="${this.avatarUrl(user.avatar)}" alt="">
                ${onlineDot}
            </div>`;
        }

        return `<div class="${cls}">
            ${this.escapeHtml(this.avatarEmoji(user))}
            ${onlineDot}
        </div>`;
    },

    // ─── Ссылки ───
    profileUrl(username) {
        return `/u/${username}`;
    },

    // ─── Хедер ───
    async buildHeader(activePage = "") {
        const res = await this.get("/api/me");
        const user = res.ok ? res.user : null;
        let notif = { unread_messages: 0, friend_requests: 0 };
        if (user) {
            const n = await this.get("/api/notifications");
            if (n.ok) notif = n;
        }

        const navItems = [
            { id: "index",   href: "/",         icon: "🏠", label: "Лента" },
            { id: "chats",   href: "/chats",    icon: "💬", label: "Чаты",   badge: notif.unread_messages },
            { id: "friends", href: "/friends",  icon: "👥", label: "Друзья", badge: notif.friend_requests },
            { id: "profile", href: "/profile",  icon: "👤", label: "Профиль" },
        ];

        if (user && (user.role === "owner" || user.role === "admin" || user.role === "developer")) {
            navItems.push({ id: "admin", href: "/admin", icon: "⚙", label: "Админ" });
        }

        const navHtml = navItems.map(item => {
            const active = item.id === activePage ? "active" : "";
            const badge = item.badge ? `<span class="badge">${item.badge}</span>` : "";
            return `<a href="${item.href}" class="${active}">
                <span>${item.icon}</span><span>${item.label}</span>${badge}
            </a>`;
        }).join("");

        const userBlock = user
            ? `<a href="${this.profileUrl(user.username)}" class="header-user">
                ${this.renderAvatar(user, "avatar-sm", user.online)}
                <span class="header-user-name">${this.renderName(user)}</span>
               </a>
               <button class="header-logout" id="header-logout-btn" title="Выйти из аккаунта">
                   <span class="header-logout-icon">⏻</span>
               </button>`
            : `<a href="/login" class="btn btn-small">Войти</a>`;

        return `
            <header class="header">
                <a href="/" class="brand">
                    <div class="brand-icon">
                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="hdrGrad" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stop-color="#0078ff"/>
                                    <stop offset="100%" stop-color="#a020f0"/>
                                </linearGradient>
                            </defs>
                            <circle cx="50" cy="50" r="45" fill="url(#hdrGrad)"/>
                            <text x="50" y="68" text-anchor="middle" font-size="50"
                                  font-weight="900" fill="white"
                                  font-family="Arial">ZB</text>
                        </svg>
                    </div>
                    <div class="brand-text">
                        <h1>ZvenoBack</h1>
                        <p>social network</p>
                    </div>
                </a>
                <nav class="nav">${navHtml}</nav>
                <div class="header-right">${userBlock}</div>
            </header>
        `;
    },

    async mountHeader(containerId = "header-container", activePage = "") {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = await this.buildHeader(activePage);

        // Навешиваем обработчик на кнопку выхода
        const logoutBtn = document.getElementById("header-logout-btn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", (e) => {
                e.preventDefault();
                if (confirm("Выйти из аккаунта?")) {
                    this.logout();
                }
            });
        }
    },

    async checkAuth(redirectIfNot = true) {
        const res = await this.get("/api/me");
        if (!res.ok && redirectIfNot) {
            window.location.href = "/login";
            return null;
        }
        return res.ok ? res.user : null;
    },

    setupAvatarPicker(inputId, previewId) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        if (!input || !preview) return;
        preview.addEventListener("click", () => input.click());
        input.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                preview.innerHTML = `<img src="${ev.target.result}" alt="">`;
                preview.style.borderStyle = "solid";
                preview.style.borderColor = "var(--accent)";
            };
            reader.readAsDataURL(file);
        });
    },

    showModal(html, onClose) {
        const wrap = document.createElement("div");
        wrap.className = "modal-overlay";
        wrap.innerHTML = `<div class="modal">${html}</div>`;
        document.body.appendChild(wrap);
        wrap.addEventListener("click", (e) => { if (e.target === wrap) closeModal(); });
        function closeModal() {
            wrap.remove();
            if (onClose) onClose();
        }
        window.__closeModal = closeModal;
        return { close: closeModal, el: wrap };
    },

    async logout() {
        await this.post("/api/logout");
        if (typeof ZBCryptoStorage !== "undefined") {
            try { ZBCryptoStorage.clear(); } catch (e) {}
        }
        window.location.href = "/login";
    },

    // ═══════════════════════════════════════════════════════
    //  ЭМОДЗИ-ПИКЕР
    // ═══════════════════════════════════════════════════════
    async buildEmojiPicker(container, currentEmoji, onSelect) {
        if (typeof container === "string") {
            container = document.getElementById(container);
        }
        if (!container) return;

        const res = await this.get("/api/emoji_list");
        const regular = res.regular || [];
        const elite = res.elite || [];
        const canElite = res.can_use_elite || false;

        container.innerHTML = `
            <div class="emoji-picker-title">Обычные</div>
            ${regular.map(e => `
                <div class="emoji-option ${e === currentEmoji ? "selected" : ""}"
                     data-emoji="${e}">${e}</div>
            `).join("")}
            ${canElite && elite.length ? `
                <div class="emoji-picker-title elite-title">👑 Элитные (для админов)</div>
                ${elite.map(e => `
                    <div class="emoji-option elite ${e === currentEmoji ? "selected" : ""}"
                         data-emoji="${e}">${e}</div>
                `).join("")}
            ` : ""}
        `;

        container.querySelectorAll(".emoji-option").forEach(opt => {
            opt.addEventListener("click", () => {
                container.querySelectorAll(".emoji-option").forEach(o =>
                    o.classList.remove("selected"));
                opt.classList.add("selected");
                if (onSelect) onSelect(opt.dataset.emoji);
            });
        });
    },

    async setEmoji(emoji, userId = null) {
        const body = { emoji: emoji };
        if (userId) body.user_id = userId;
        const res = await this.post("/api/set_emoji", body);
        return res;
    },
};

window.ZB = ZB;

// ─── Навешиваем на все [data-logout] ───
document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-logout]");
    if (t) {
        e.preventDefault();
        ZB.logout();
    }
});