import { beforeEach, describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, encryptionConfigured } from "./crypto";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY_A;
});

describe("шифрування токенів", () => {
  it("розшифровує те саме, що зашифрувало", () => {
    const secret = "1//09xyz-REFRESH-токен-з-кирилицею";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("щоразу дає інший шифротекст", () => {
    // Однаковий шифротекст означав би сталий вектор ініціалізації —
    // з ним однакові токени видно як однакові навіть без ключа.
    expect(encryptSecret("те саме")).not.toBe(encryptSecret("те саме"));
  });

  it("не лишає таємницю у відкритому вигляді", () => {
    expect(encryptSecret("REFRESH-TOKEN")).not.toContain("REFRESH");
  });

  it("виявляє підміну, а не повертає сміття", () => {
    const payload = encryptSecret("таємниця");
    const [iv, tag, data] = payload.split(".");
    const tampered = `${iv}.${tag}.${data.slice(0, -2)}${data.endsWith("AA") ? "AB" : "AA"}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("не читається чужим ключем", () => {
    const payload = encryptSecret("таємниця");
    process.env.TOKEN_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(payload)).toThrow();
  });

  it("відхиляє пошкоджений рядок", () => {
    expect(() => decryptSecret("не-схоже-на-шифротекст")).toThrow(/Пошкоджений/);
  });
});

describe("налаштування ключа", () => {
  it("без ключа пояснює, як його зробити", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(encryptionConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(/openssl rand -hex 32/);
  });

  it("ключ неправильної довжини не приймається", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "abc123";
    expect(encryptionConfigured()).toBe(false);
  });
});
