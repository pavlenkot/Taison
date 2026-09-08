import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Шифрування довгоживучих токенів перед записом у базу.
 *
 * Refresh-токен Google діє роками і дає доступ до теки на Диску, тож у базі
 * він не має лежати відкритим текстом: дамп бази без ключа застосунку тоді
 * нічого не дає. AES-256-GCM, бо він заразом і перевіряє цілісність —
 * підмінений рядок не розшифрується, а не поверне сміття.
 */
function secretKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY не налаштовано. Згенеруйте: openssl rand -hex 32",
    );
  }

  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY має бути 64 шістнадцяткові символи (32 байти), а не ${key.length}`,
    );
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Пошкоджений зашифрований рядок");
  }

  const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Чи взагалі можна працювати з токенами — щоб показати зрозумілу помилку. */
export function encryptionConfigured(): boolean {
  try {
    secretKey();
    return true;
  } catch {
    return false;
  }
}
