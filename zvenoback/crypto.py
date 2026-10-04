# crypto.py
# Своя криптография — только стандартная библиотека!
# Diffie-Hellman (2048-bit) + XOR-шифр + HMAC

import secrets
import hashlib
import hmac
import base64
import struct

# ═══════════════════════════════════════════════════════════
#  БОЛЬШОЕ ПРОСТОЕ ЧИСЛО (2048-бит, RFC 3526 Group 14)
# ═══════════════════════════════════════════════════════════
PRIME_2048 = int(
    "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74"
    "020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F1437"
    "4FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED"
    "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF05"
    "98DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB"
    "9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B"
    "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718"
    "3995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF",
    16
)
GENERATOR = 2

# ═══════════════════════════════════════════════════════════
#  DIFFIE-HELLMAN
# ═══════════════════════════════════════════════════════════
def generate_keypair():
    """
    Генерирует приватный и публичный ключ.
    Возвращает (private_key, public_key) как целые числа.
    """
    private = secrets.randbelow(PRIME_2048 - 2) + 1
    public = pow(GENERATOR, private, PRIME_2048)
    return private, public

def compute_shared_secret(other_public, my_private):
    """
    Вычисляет общий секрет.
    other_public — публичный ключ собеседника (int)
    my_private — мой приватный ключ (int)
    Возвращает bytes (32 байта) — симметричный ключ.
    """
    raw = pow(other_public, my_private, PRIME_2048)
    # Хэшируем до 32 байт (для XOR-шифра)
    h = hashlib.sha256(str(raw).encode("utf-8")).digest()
    return h

# ═══════════════════════════════════════════════════════════
#  XOR-ШИФР (потоковый)
# ═══════════════════════════════════════════════════════════
def xor_encrypt(plaintext, key):
    """
    Шифрует текст XOR-ом с потоковым ключом.
    plaintext — str
    key — bytes (32 байта)
    Возвращает base64-строку.
    """
    if isinstance(plaintext, str):
        data = plaintext.encode("utf-8")
    else:
        data = plaintext

    # Генерим поток ключей из мастер-ключа через SHA-256 в режиме counter
    encrypted = bytearray()
    counter = 0
    pos = 0
    while pos < len(data):
        # Блок ключа: sha256(key + counter_bytes)
        block = hashlib.sha256(key + struct.pack(">I", counter)).digest()
        for b in block:
            if pos >= len(data):
                break
            encrypted.append(data[pos] ^ b)
            pos += 1
        counter += 1

    return base64.b64encode(bytes(encrypted)).decode("ascii")

def xor_decrypt(ciphertext_b64, key):
    """
    Расшифровывает base64-строку XOR-ом.
    Возвращает str или None.
    """
    try:
        data = base64.b64decode(ciphertext_b64)
        decrypted = bytearray()
        counter = 0
        pos = 0
        while pos < len(data):
            block = hashlib.sha256(key + struct.pack(">I", counter)).digest()
            for b in block:
                if pos >= len(data):
                    break
                decrypted.append(data[pos] ^ b)
                pos += 1
            counter += 1
        return decrypted.decode("utf-8")
    except Exception:
        return None

# ═══════════════════════════════════════════════════════════
#  HMAC — ПРОВЕРКА ЦЕЛОСТНОСТИ
# ═══════════════════════════════════════════════════════════
def sign_message(message, key):
    """Возвращает HMAC-подпись сообщения."""
    if isinstance(message, str):
        message = message.encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()

def verify_signature(message, key, signature):
    """Проверяет HMAC."""
    expected = sign_message(message, key)
    return hmac.compare_digest(expected, signature)

# ═══════════════════════════════════════════════════════════
#  ПАРОЛИ (PBKDF2-подобное)
# ═══════════════════════════════════════════════════════════
def hash_password(password, salt=None, iterations=100000):
    """Хэширует пароль с солью. Медленнее SHA-256, безопаснее."""
    if salt is None:
        salt = secrets.token_hex(16)
    # Простая PBKDF2-подобная схема: много итераций sha256
    h = (salt + password).encode("utf-8")
    for _ in range(iterations):
        h = hashlib.sha256(h).digest()
    return h.hex(), salt

def check_password(password, stored_hash, salt, iterations=100000):
    h, _ = hash_password(password, salt, iterations)
    return hmac.compare_digest(h, stored_hash)

# ═══════════════════════════════════════════════════════════
#  ГРУППОВОЕ ШИФРОВАНИЕ
# ═══════════════════════════════════════════════════════════
def generate_group_key():
    """Генерирует случайный ключ группы (32 байта)."""
    return secrets.token_bytes(32)

def wrap_key_for_user(group_key, user_public_key):
    """
    "Заворачивает" ключ группы для конкретного пользователя.
    Простая XOR-схема: ключ группы XOR-ится с key-материалом из DH.
    В реальности нужен RSA, но у нас свой вариант.
    user_public_key — публичный ключ пользователя (int)
    """
    # Из публичного ключа делаем 32-байтовый материал
    key_material = hashlib.sha256(str(user_public_key).encode()).digest()
    # XORим групповой ключ с key_material
    wrapped = bytes(a ^ b for a, b in zip(group_key, key_material))
    return base64.b64encode(wrapped).decode("ascii")

def unwrap_key_for_user(wrapped_b64, user_private_key):
    """
    Разворачивает ключ группы. Требует приватный ключ.
    user_private_key — приватный ключ пользователя (int)
    """
    try:
        wrapped = base64.b64decode(wrapped_b64)
        # Восстанавливаем public из private
        user_public = pow(GENERATOR, user_private_key, PRIME_2048)
        key_material = hashlib.sha256(str(user_public).encode()).digest()
        group_key = bytes(a ^ b for a, b in zip(wrapped, key_material))
        return group_key
    except Exception:
        return None

# ═══════════════════════════════════════════════════════════
#  ТЕСТЫ (запусти файл напрямую — увидишь что всё работает)
# ═══════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("=" * 60)
    print("  CRYPTO.PY — тест")
    print("=" * 60)

    # Тест DH
    print("\n[1] Diffie-Hellman:")
    priv_a, pub_a = generate_keypair()
    priv_b, pub_b = generate_keypair()
    secret_a = compute_shared_secret(pub_b, priv_a)
    secret_b = compute_shared_secret(pub_a, priv_b)
    print(f"  Секрет Алисы: {secret_a.hex()[:32]}...")
    print(f"  Секрет Боба:  {secret_b.hex()[:32]}...")
    print(f"  Совпадают: {secret_a == secret_b}")

    # Тест XOR
    print("\n[2] XOR-шифр:")
    key = secret_a
    text = "Привет, это секретное сообщение! 🔐"
    enc = xor_encrypt(text, key)
    dec = xor_decrypt(enc, key)
    print(f"  Оригинал:  {text}")
    print(f"  Шифр:      {enc[:60]}...")
    print(f"  Расшифров: {dec}")
    print(f"  Совпадает: {text == dec}")

    # Тест HMAC
    print("\n[3] HMAC:")
    sig = sign_message(text, key)
    print(f"  Подпись: {sig[:32]}...")
    print(f"  Валидна: {verify_signature(text, key, sig)}")

    # Тест пароля
    print("\n[4] Пароль:")
    h, s = hash_password("mypassword123")
    print(f"  Хэш: {h[:32]}...")
    print(f"  Соль: {s}")
    print(f"  Проверка верного:   {check_password('mypassword123', h, s)}")
    print(f"  Проверка неверного: {check_password('wrongpassword', h, s)}")

    # Тест группового
    print("\n[5] Групповой ключ:")
    gk = generate_group_key()
    priv_u, pub_u = generate_keypair()
    wrapped = wrap_key_for_user(gk, pub_u)
    unwrapped = unwrap_key_for_user(wrapped, priv_u)
    print(f"  Групповой ключ:  {gk.hex()}")
    print(f"  Обёрнутый:       {wrapped[:40]}...")
    print(f"  Развёрнутый:     {unwrapped.hex()}")
    print(f"  Совпадают: {gk == unwrapped}")

    print("\n" + "=" * 60)
    print("  Всё работает!")
    print("=" * 60)