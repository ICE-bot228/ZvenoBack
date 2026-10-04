// ═══════════════════════════════════════════════════════════
//  ZVENOBACK — Crypto (свой SHA-256, работает на http://)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
//  СВОЙ SHA-256 (чистый JS, без crypto.subtle)
// ═══════════════════════════════════════════════════════════
const ZBSha256 = (() => {
    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
        0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
        0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
        0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    function rotr(x, n) {
        return (x >>> n) | (x << (32 - n));
    }

    function utf8Bytes(str) {
        const out = [];
        for (let i = 0; i < str.length; i++) {
            let c = str.charCodeAt(i);
            if (c < 0x80) out.push(c);
            else if (c < 0x800) {
                out.push(0xc0 | (c >> 6));
                out.push(0x80 | (c & 0x3f));
            } else if (c < 0xd800 || c >= 0xe000) {
                out.push(0xe0 | (c >> 12));
                out.push(0x80 | ((c >> 6) & 0x3f));
                out.push(0x80 | (c & 0x3f));
            } else {
                i++;
                c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
                out.push(0xf0 | (c >> 18));
                out.push(0x80 | ((c >> 12) & 0x3f));
                out.push(0x80 | ((c >> 6) & 0x3f));
                out.push(0x80 | (c & 0x3f));
            }
        }
        return out;
    }

    function hashBytes(bytes) {
        const H = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
        ];

        const l = bytes.length;
        const bitLen = l * 8;
        const withOne = l + 1;
        const padLen = ((withOne % 64) <= 56)
            ? 56 - (withOne % 64)
            : 120 - (withOne % 64);
        const total = withOne + padLen + 8;
        const msg = new Array(total).fill(0);
        for (let i = 0; i < l; i++) msg[i] = bytes[i];
        msg[l] = 0x80;
        // Длина в битах (big-endian, 64 бита)
        // JS safe до 2^53, этого хватит
        const hi = Math.floor(bitLen / 0x100000000);
        const lo = bitLen >>> 0;
        msg[total - 8] = (hi >>> 24) & 0xff;
        msg[total - 7] = (hi >>> 16) & 0xff;
        msg[total - 6] = (hi >>> 8) & 0xff;
        msg[total - 5] = hi & 0xff;
        msg[total - 4] = (lo >>> 24) & 0xff;
        msg[total - 3] = (lo >>> 16) & 0xff;
        msg[total - 2] = (lo >>> 8) & 0xff;
        msg[total - 1] = lo & 0xff;

        const w = new Array(64);

        for (let off = 0; off < total; off += 64) {
            for (let i = 0; i < 16; i++) {
                w[i] = (msg[off + i * 4] << 24) |
                       (msg[off + i * 4 + 1] << 16) |
                       (msg[off + i * 4 + 2] << 8) |
                       (msg[off + i * 4 + 3]);
            }
            for (let i = 16; i < 64; i++) {
                const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }

            let [a, b, c, d, e, f, g, h] = H;

            for (let i = 0; i < 64; i++) {
                const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                const ch = (e & f) ^ (~e & g);
                const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
                const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const temp2 = (S0 + maj) >>> 0;

                h = g;
                g = f;
                f = e;
                e = (d + temp1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (temp1 + temp2) >>> 0;
            }

            H[0] = (H[0] + a) >>> 0;
            H[1] = (H[1] + b) >>> 0;
            H[2] = (H[2] + c) >>> 0;
            H[3] = (H[3] + d) >>> 0;
            H[4] = (H[4] + e) >>> 0;
            H[5] = (H[5] + f) >>> 0;
            H[6] = (H[6] + g) >>> 0;
            H[7] = (H[7] + h) >>> 0;
        }

        // 32 байта big-endian
        const out = new Uint8Array(32);
        for (let i = 0; i < 8; i++) {
            out[i * 4] = (H[i] >>> 24) & 0xff;
            out[i * 4 + 1] = (H[i] >>> 16) & 0xff;
            out[i * 4 + 2] = (H[i] >>> 8) & 0xff;
            out[i * 4 + 3] = H[i] & 0xff;
        }
        return out;
    }

    // Публичные методы
    return {
        // Возвращает Uint8Array (32 байта)
        hashBytes: hashBytes,
        // Возвращает Uint8Array из строки
        hashString: (str) => hashBytes(utf8Bytes(str)),
        // Хэширует строку + счётчик (для XOR-блока)
        hashStringCounter: (str, counter) => {
            const bytes = utf8Bytes(str);
            const cnt = new Uint8Array(4);
            cnt[0] = (counter >>> 24) & 0xff;
            cnt[1] = (counter >>> 16) & 0xff;
            cnt[2] = (counter >>> 8) & 0xff;
            cnt[3] = counter & 0xff;
            const combined = new Uint8Array(bytes.length + 4);
            combined.set(bytes, 0);
            combined.set(cnt, bytes.length);
            return hashBytes(Array.from(combined));
        },
        // Хэш из массива байтов + счётчик (для XOR-шифра)
        hashBytesCounter: (bytes, counter) => {
            const cnt = new Uint8Array(4);
            cnt[0] = (counter >>> 24) & 0xff;
            cnt[1] = (counter >>> 16) & 0xff;
            cnt[2] = (counter >>> 8) & 0xff;
            cnt[3] = counter & 0xff;
            const combined = new Uint8Array(bytes.length + 4);
            combined.set(bytes, 0);
            combined.set(cnt, bytes.length);
            return hashBytes(Array.from(combined));
        },
    };
})();

// ═══════════════════════════════════════════════════════════
//  DIFFIE-HELLMAN
// ═══════════════════════════════════════════════════════════
const ZBCrypto = (() => {
    const PRIME_HEX =
        "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74" +
        "020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F1437" +
        "4FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED" +
        "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF05" +
        "98DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB" +
        "9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B" +
        "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718" +
        "3995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF";

    const P = BigInt("0x" + PRIME_HEX);
    const G = 2n;

    function modPow(base, exp, mod) {
        let result = 1n;
        base = base % mod;
        while (exp > 0n) {
            if (exp & 1n) result = (result * base) % mod;
            exp >>= 1n;
            base = (base * base) % mod;
        }
        return result;
    }

    function randomBigInt(max) {
        const bytes = new Uint8Array(256);
        // window.crypto.getRandomValues работает и на http://
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < bytes.length; i++) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
        }
        let hex = "0x";
        for (const b of bytes) hex += b.toString(16).padStart(2, "0");
        return BigInt(hex) % max;
    }

    function bytesToHex(bytes) {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes;
    }

    let myPrivate = null;
    let myPublic = null;

    function generateKeypair() {
        myPrivate = randomBigInt(P - 2n) + 1n;
        myPublic = modPow(G, myPrivate, P);
        return { private: myPrivate, public: myPublic };
    }

    // Синхронная! Возвращает Uint8Array 32 байта
    function computeSharedSecret(otherPublic) {
        if (!otherPublic || otherPublic === "null" || otherPublic === "0") {
            console.warn("E2E: нет public_key — fallback");
            return ZBSha256.hashString("zvenoback_fallback_secret_v1");
        }

        try {
            const secretInt = modPow(BigInt(otherPublic), myPrivate, P);
            return ZBSha256.hashString(secretInt.toString());
        } catch (e) {
            console.error("E2E: ошибка modPow", e);
            return ZBSha256.hashString("zvenoback_fallback_secret_v1");
        }
    }

    // XOR-шифр — синхронный
    function xorEncrypt(plaintext, key) {
        if (!key) return null;
        try {
            // UTF-8
            const data = [];
            for (let i = 0; i < plaintext.length; i++) {
                let c = plaintext.charCodeAt(i);
                if (c < 0x80) data.push(c);
                else if (c < 0x800) {
                    data.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
                } else {
                    data.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
                }
            }

            const encrypted = new Uint8Array(data.length);
            const blocksNeeded = Math.ceil(data.length / 32);
            let offset = 0;
            for (let counter = 0; counter < blocksNeeded; counter++) {
                const block = ZBSha256.hashBytesCounter(Array.from(key), counter);
                for (let i = 0; i < 32 && offset < data.length; i++, offset++) {
                    encrypted[offset] = data[offset] ^ block[i];
                }
            }
            return base64Encode(encrypted);
        } catch (e) {
            console.error("Encrypt error:", e);
            return null;
        }
    }

    function xorDecrypt(ciphertextB64, key) {
        if (!key) return "[нет ключа]";
        try {
            const data = base64Decode(ciphertextB64);
            const decrypted = new Uint8Array(data.length);
            const blocksNeeded = Math.ceil(data.length / 32);
            let offset = 0;
            for (let counter = 0; counter < blocksNeeded; counter++) {
                const block = ZBSha256.hashBytesCounter(Array.from(key), counter);
                for (let i = 0; i < 32 && offset < data.length; i++, offset++) {
                    decrypted[offset] = data[offset] ^ block[i];
                }
            }
            // UTF-8 → строка
            return new TextDecoder("utf-8").decode(decrypted);
        } catch (e) {
            console.error("Decrypt error:", e);
            return "[ошибка расшифровки]";
        }
    }

    // Base64
    function base64Encode(bytes) {
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    function base64Decode(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    return {
        generateKeypair,
        computeSharedSecret,
        xorEncrypt,
        xorDecrypt,
        getMyPublic: () => myPublic,
        getMyPrivate: () => myPrivate,
    };
})();

// Хелперы localStorage
const ZBCryptoStorage = {
    save() {
        const priv = ZBCrypto.getMyPrivate();
        const pub = ZBCrypto.getMyPublic();
        if (priv && pub) {
            localStorage.setItem("zb_priv", priv.toString());
            localStorage.setItem("zb_pub", pub.toString());
        }
    },
    load() {
        const priv = localStorage.getItem("zb_priv");
        const pub = localStorage.getItem("zb_pub");
        return { priv, pub };
    },
    clear() {
        localStorage.removeItem("zb_priv");
        localStorage.removeItem("zb_pub");
    }
};