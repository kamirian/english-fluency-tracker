// English Fluency Tracker — small crypto helpers built on Web Crypto.
// Copyright (c) 2026 Kiyan Amirian. All rights reserved.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(String(value || "").replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function base64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(byteLength = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function sha256Hex(value) {
  return [...await sha256(value)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

let cachedKey = null;
let cachedSecret = "";

async function encryptionKey(env) {
  const secret = String(env.KEY_ENCRYPTION_SECRET || "");
  if (!secret) throw new Error("KEY_ENCRYPTION_SECRET is not configured.");
  if (cachedKey && cachedSecret === secret) return cachedKey;
  let raw;
  try { raw = base64ToBytes(secret); } catch { raw = new Uint8Array(); }
  if (raw.length !== 32) throw new Error("KEY_ENCRYPTION_SECRET must be 32 random bytes encoded as base64 (for example: openssl rand -base64 32).");
  cachedKey = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  cachedSecret = secret;
  return cachedKey;
}

// The context (the owner's user ID) is bound into the ciphertext, so a stored key
// cannot be decrypted if it is moved to another account's row.
export async function encryptSecret(env, plaintext, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(context) }, await encryptionKey(env), encoder.encode(plaintext));
  return { ciphertext: bytesToBase64(ciphertext), iv: bytesToBase64(iv) };
}

export async function decryptSecret(env, ciphertext, iv, context) {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv), additionalData: encoder.encode(context) }, await encryptionKey(env), base64ToBytes(ciphertext));
  return decoder.decode(plaintext);
}

export function encryptionConfigured(env) {
  try { return base64ToBytes(env.KEY_ENCRYPTION_SECRET || "").length === 32; } catch { return false; }
}
