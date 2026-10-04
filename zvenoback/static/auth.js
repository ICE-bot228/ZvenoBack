// ═══════════════════════════════════════════════════════════
//  ZVENOBACK — Авторизация v4.0 (эмодзи-пикер)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
//  ЖИВАЯ ПРОВЕРКА ЛОГИНА
// ═══════════════════════════════════════════════════════════
const UsernameChecker = {
    timer: null,
    lastValue: "",
    lastResult: null,
    checking: false,

    init() {
        const input = document.getElementById("reg-username");
        const status = document.getElementById("reg-username-status");
        if (!input || !status) return;

        input.addEventListener("input", () => {
            const val = input.value.trim().toLowerCase();
            if (this.timer) clearTimeout(this.timer);

            if (!val) {
                status.textContent = "";
                status.className = "username-status";
                this.lastResult = null;
                return;
            }

            this.lastValue = val;
            status.textContent = "⏳ Проверяю...";
            status.className = "username-status checking";

            this.timer = setTimeout(() => this.check(val), 400);
        });
    },

    async check(username) {
        const status = document.getElementById("reg-username-status");
        if (!status) return null;
        this.checking = true;

        try {
            const res = await fetch(`/api/check_username?u=${encodeURIComponent(username)}`);
            const data = await res.json();

            if (data.available) {
                status.textContent = `✓ @${username} свободен`;
                status.className = "username-status available";
                this.lastResult = { available: true, reason: null, reserved: false };
            } else {
                const isReserved = !!data.reserved || (data.reason === "Зарезервирован");
                const icon = isReserved ? "🔒" : "✕";
                status.textContent = `${icon} ${data.reason || "Занят"}`;
                status.className = "username-status taken" + (isReserved ? " reserved" : "");
                this.lastResult = {
                    available: false,
                    reason: data.reason,
                    reserved: isReserved,
                };
            }
            this.checking = false;
            return this.lastResult;
        } catch (e) {
            status.textContent = "⚠ Ошибка проверки";
            status.className = "username-status error";
            this.lastResult = { available: false, reason: "network", reserved: false };
            this.checking = false;
            return this.lastResult;
        }
    },
};

// ═══════════════════════════════════════════════════════════
//  РЕГИСТРАЦИЯ
// ═══════════════════════════════════════════════════════════
let selectedEmoji = "🐱";

async function doRegister(e) {
    e.preventDefault();

    const username = document.getElementById("reg-username").value.trim().toLowerCase();
    const display = document.getElementById("reg-display").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const password2 = document.getElementById("reg-password2").value;
    const errorEl = document.getElementById("reg-error");
    const btn = document.getElementById("reg-btn");

    errorEl.textContent = "";

    // Валидация
    if (!username || !email || !password) {
        errorEl.textContent = "Заполни обязательные поля"; return;
    }
    if (username.length < 3 || username.length > 20) {
        errorEl.textContent = "Логин 3-20 символов"; return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        errorEl.textContent = "Логин: только буквы, цифры и _"; return;
    }
    if (!display) {
        errorEl.textContent = "Введи имя"; return;
    }
    if (display.length > 40) {
        errorEl.textContent = "Имя максимум 40 символов"; return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errorEl.textContent = "Неверный email"; return;
    }
    if (password.length < 6) {
        errorEl.textContent = "Пароль минимум 6 символов"; return;
    }
    if (password !== password2) {
        errorEl.textContent = "Пароли не совпадают"; return;
    }

    // Проверка логина
    let checkResult = UsernameChecker.lastResult;
    if (!checkResult || UsernameChecker.lastValue !== username) {
        errorEl.textContent = "Проверяю логин...";
        checkResult = await UsernameChecker.check(username);
        errorEl.textContent = "";
    }
    if (checkResult && !checkResult.available && !checkResult.reserved) {
        errorEl.textContent = `Логин @${username} уже занят`;
        return;
    }

    // Отправка
    const fd = new FormData();
    fd.append("username", username);
    fd.append("display", display);
    fd.append("email", email);
    fd.append("password", password);
    fd.append("emoji", selectedEmoji);

    btn.disabled = true;
    btn.textContent = "Создаю аккаунт...";

    try {
        const res = await fetch("/api/register", {
            method: "POST",
            body: fd,
            credentials: "same-origin",
        });
        const data = await res.json();

        if (!data.ok) {
            errorEl.textContent = data.error || "Ошибка регистрации";
            btn.disabled = false;
            btn.textContent = "Создать аккаунт";
            return;
        }

        // E2E ключи
        try {
            if (typeof ZBCrypto !== "undefined") {
                ZBCrypto.generateKeypair();
                if (typeof ZBCryptoStorage !== "undefined") ZBCryptoStorage.save();
            }
        } catch (e) {
            console.warn("Crypto init failed:", e);
        }

        const welcome = data.is_owner
            ? "Добро пожаловать, Владелец ZvenoBack! 👑"
            : "Аккаунт создан! Добро пожаловать в ZvenoBack 🎉";

        ZB.toast(welcome, "success");
        setTimeout(() => { window.location.href = "/"; }, 900);
    } catch (e) {
        console.error(e);
        errorEl.textContent = "Сеть недоступна";
        btn.disabled = false;
        btn.textContent = "Создать аккаунт";
    }
}

// ═══════════════════════════════════════════════════════════
//  ВХОД
// ═══════════════════════════════════════════════════════════
async function doLogin(e) {
    e.preventDefault();

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");
    const btn = document.getElementById("login-btn");

    errorEl.textContent = "";

    if (!username || !password) {
        errorEl.textContent = "Заполни все поля"; return;
    }

    btn.disabled = true;
    btn.textContent = "Вхожу...";

    try {
        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
            credentials: "same-origin",
        });
        const data = await res.json();

        if (!data.ok) {
            errorEl.textContent = data.error || "Ошибка входа";
            btn.disabled = false;
            btn.textContent = "Войти";
            return;
        }

        try {
            if (typeof ZBCrypto !== "undefined") {
                ZBCrypto.generateKeypair();
                if (typeof ZBCryptoStorage !== "undefined") ZBCryptoStorage.save();
            }
        } catch (e) {
            console.warn("Crypto init failed:", e);
        }

        ZB.toast("Добро пожаловать! 👋", "success");
        setTimeout(() => { window.location.href = "/"; }, 400);
    } catch (e) {
        console.error(e);
        errorEl.textContent = "Сеть недоступна";
        btn.disabled = false;
        btn.textContent = "Войти";
    }
}

// ═══════════════════════════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
    // Регистрация
    const regForm = document.getElementById("reg-form");
    if (regForm) {
        regForm.addEventListener("submit", doRegister);
        UsernameChecker.init();

        // Эмодзи-пикер
        const picker = document.getElementById("emoji-picker");
        if (picker) {
            await ZB.buildEmojiPicker(picker, selectedEmoji, (emoji) => {
                selectedEmoji = emoji;
            });
        }
    }

    // Логин
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", doLogin);
    }
});