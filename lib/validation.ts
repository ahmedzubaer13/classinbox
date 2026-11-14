import { createHash, randomBytes } from "node:crypto";

export const maxFileSize = () => (Number(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024;
export const maxFiles = () => Math.min(20, Math.max(1, Number(process.env.MAX_FILES_PER_SUBMISSION) || 10));

export function newPublicToken() {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function safeFilename(input: string) {
  const leaf = input.split(/[\\/]/).pop() || "upload";
  const cleaned = leaf.normalize("NFKC").replace(/[^\p{L}\p{N}._() -]/gu, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "upload").slice(0, 150);
}

export function cleanText(input: unknown, max: number) {
  return typeof input === "string" ? input.trim().replace(/\s+/g, " ").slice(0, max) : "";
}
