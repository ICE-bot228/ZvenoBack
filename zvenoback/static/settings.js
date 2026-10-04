// ═══════════════════════════════════════════════════════════
//  ZVENOBACK — Настройки v1.0
// ═══════════════════════════════════════════════════════════

let me = null;

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
async function initSettings() {
    me = await ZB.checkAuth(true);
    if (!me) return;

    await ZB.mountHeader("header-container", "");

    renderAvatarPreview();
    renderInfo();
    fillProfileForm();

    setupProfileSave();
    setupPasswordSave();
    setupEmojiChange();
    setupLogout();
}

// ═══════════════════════════════════════════════════════════
//  АВАТАР + ИНФО
// ═══════════════════════════════════════════════════════════
function renderAvatarPreview() {
    const el = document.getElementById("settings-avatar");
    if (!el) return;

    const avatarInner = me.avatar
        ? `<img src="${ZB.avatarUrl(me.avatar)}" alt="">`
        : ZB.escapeHtml(me.emoji || "🐱");

    el.innerHTML = `<div class="avatar avatar-xl">${avatarInner}</div>`;

    const nameEl = document.getElementById("settings-username");
    const loginEl = document.getElementById("settings-login");
    if (nameEl) nameEl.textContent = ZB.displayName(me);
    if (loginEl) loginEl.textContent = "@" + me.username;
}

function renderInfo() {
    const el = document.getElementById("settings-info");
    if (!el) return;

    const roleLabel = {
        "owner": "👑 Владелец",
        "admin": "⚙ Администратор",
        "developer": "🛠 Разработчик",
        "user": "Пользователь",
    }[me.role] || me.role;

    el.innerHTML = `
        <div class="settings-info-row">
            <span>Логин</span>
            <b>@${ZB.escapeHtml(me.username)}</b>
        </div>
        <div class="settings-info-row">
            <span>Email</span>
            <b>${ZB.escapeHtml(me.email || "—")}</b>
        </div>
        <div class="settings-info-row">
            <span>ID</span>
            <b>#${me.id}</b>
        </div>
        <div class="settings-info-row">
            <span>Роль</span>
            <b>${roleLabel}</b>
        </div>
        <div class="settings-info-row">
            <span>Верификация</span>
            <b>${me.verified ? "✓ Верифицирован" : "✗ Нет"}</b>
        </div>
        <div class="settings-info-row">
            <span>Регистрация</span>
            <b>${ZB.formatDate(me.created_at)}</b>
        </div>
        <div class="settings-info-row">
            <span>Последний вход</span>
            <b>${ZB.formatDate(me.last_seen)}</b>
        </div>
    `;
}

function fillProfileForm() {
    const displayEl = document.getElementById("settings-display");
    const bioEl = document.getElementById("settings-bio");
    if (displayEl) displayEl.value = me.display || "";
    if (bioEl) bioEl.value = me.bio || "";
}

// ═══════════════════════════════════════════════════════════
//  СОХРАНЕНИЕ ПРОФИЛЯ (имя + био)
// ═══════════════════════════════════════════════════════════
function setupProfileSave() {
    const btn = document.getElementById("settings-save-profile");
    const errEl = document.getElementById("settings-profile-error");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        errEl.textContent = "";

        const display = document.getElementById("settings-display").value.trim();
        const bio = document.getElementById("settings-bio").value.trim();

        if (!display) {
            errEl.textContent = "Имя не может быть пустым";
            return;
        }
        if (display.length > 40) {
            errEl.textContent = "Имя макс 40 символов";
            return;
        }
        if (bio.length > 300) {
            errEl.textContent = "Био макс 300 символов";
            return;
        }

        btn.disabled = true;
        btn.textContent = "Сохранение...";

        const res = await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display, bio }),
            credentials: "same-origin",
        });
        const data = await res.json();

        if (!data.ok) {
            errEl.textContent = data.error || "Ошибка";
            btn.disabled = false;
            btn.textContent = "💾 Сохранить";
            return;
        }

        ZB.toast("Профиль обновлён ✓", "success");

        // Обновляем текущего юзера
        const fresh = await ZB.get("/api/me");
        if (fresh.ok) {
            me = fresh.user;
            renderAvatarPreview();
            renderInfo();
        }

        btn.disabled = false;
        btn.textContent = "💾 Сохранить";
    });
}

// ═══════════════════════════════════════════════════════════
//  СМЕНА ПАРОЛЯ
// ═══════════════════════════════════════════════════════════
function setupPasswordSave() {
    const btn = document.getElementById("settings-save-password");
    const errEl = document.getElementById("settings-password-error");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        errEl.textContent = "";

        const oldPw = document.getElementById("settings-old-password").value;
        const newPw = document.getElementById("settings-new-password").value;
        const newPw2 = document.getElementById("settings-new-password2").value;

        if (!oldPw || !newPw || !newPw2) {
            errEl.textContent = "Заполни все поля";
            return;
        }
        if (newPw.length < 6) {
            errEl.textContent = "Минимум 6 символов";
            return;
        }
        if (newPw !== newPw2) {
            errEl.textContent = "Пароли не совпадают";
            return;
        }
        if (newPw === oldPw) {
            errEl.textContent = "Новый пароль совпадает со старым";
            return;
        }

        btn.disabled = true;
        btn.textContent = "Смена...";

        const res = await ZB.post("/api/change_password", {
            old_password: oldPw,
            new_password: newPw,
        });

        if (!res.ok) {
            errEl.textContent = res.error || "Ошибка";
            btn.disabled = false;
            btn.textContent = "🔑 Сменить пароль";
            return;
        }

        ZB.toast("Пароль изменён ✓", "success");

        // Очищаем поля
        document.getElementById("settings-old-password").value = "";
        document.getElementById("settings-new-password").value = "";
        document.getElementById("settings-new-password2").value = "";

        btn.disabled = false;
        btn.textContent = "🔑 Сменить пароль";
    });
}

// ═══════════════════════════════════════════════════════════
//  СМЕНА ЭМОДЗИ
// ═══════════════════════════════════════════════════════════
function setupEmojiChange() {
    const btn = document.getElementById("settings-change-emoji");
    if (!btn) return;

    btn.addEventListener("click", () => {
        const html = `
            <div class="modal-header">
                <h3>🎨 Сменить эмодзи</h3>
                <button class="modal-close" id="emoji-modal-close">✕</button>
            </div>

            <div class="emoji-picker" id="settings-emoji-picker">
                <div class="feed-loading" style="grid-column:1/-1;padding:20px 0;">
                    <div class="spinner"></div>
                </div>
            </div>

            <div class="form-error" id="emoji-modal-error"></div>

            <div style="display:flex;gap:10px;margin-top:16px;">
                <button class="btn btn-block" id="emoji-modal-save">
                    💾 Сохранить
                </button>
                <button class="btn btn-secondary" id="emoji-modal-cancel">
                    Отмена
                </button>
            </div>
        `;

        const modal = ZB.showModal(html);

        let selected = me.emoji || "🐱";

        ZB.buildEmojiPicker("settings-emoji-picker", selected, (emoji) => {
            selected = emoji;
        });

        document.getElementById("emoji-modal-close").addEventListener("click", () => modal.close());
        document.getElementById("emoji-modal-cancel").addEventListener("click", () => modal.close());

        document.getElementById("emoji-modal-save").addEventListener("click", async () => {
            const errEl = document.getElementById("emoji-modal-error");
            const saveBtn = document.getElementById("emoji-modal-save");
            errEl.textContent = "";

            if (!selected || selected === me.emoji) {
                errEl.textContent = "Выбери другой эмодзи";
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = "Сохранение...";

            const res = await ZB.setEmoji(selected);

            if (!res.ok) {
                errEl.textContent = res.error || "Ошибка";
                saveBtn.disabled = false;
                saveBtn.textContent = "💾 Сохранить";
                return;
            }

            ZB.toast("Эмодзи обновлён ✓", "success");

            // Обновляем
            const fresh = await ZB.get("/api/me");
            if (fresh.ok) {
                me = fresh.user;
                renderAvatarPreview();
                renderInfo();
            }

            modal.close();
        });
    });
}

// ═══════════════════════════════════════════════════════════
//  ВЫХОД
// ═══════════════════════════════════════════════════════════
function setupLogout() {
    const btn = document.getElementById("settings-logout");
    if (!btn) return;

    btn.addEventListener("click", () => {
        if (confirm("Выйти из аккаунта?")) {
            ZB.logout();
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  СТАРТ
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", initSettings);