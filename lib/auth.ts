import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "./db";

const derive = promisify(scrypt);
const cookieName = "scheduler_session";
const maxAge = 60 * 60 * 24 * 30;

export const token = () => randomBytes(24).toString("base64url");
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function passwordHash(password: string, salt = token()) {
  const key = await derive(password, salt, 64) as Buffer;
  return salt + ":" + key.toString("hex");
}

export async function matchesPassword(password: string, stored?: string) {
  const expected = stored || "missing:" + "0".repeat(128);
  const actual = await passwordHash(password, expected.split(":")[0]);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual)) && Boolean(stored);
}

export async function openSession(userId: string) {
  const value = token();
  await db().session.create({ data: {
    token: hash(value), userId, expiresAt: new Date(Date.now() + maxAge * 1000),
  } });
  (await cookies()).set(cookieName, value, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge,
  });
}

export async function currentUser() {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) return null;
  const session = await db().session.findUnique({
    where: { token: hash(value), expiresAt: { gt: new Date() } },
    select: { user: { select: { id: true, familyId: true, name: true, role: true } } },
  });
  return session?.user ?? null;
}

export async function closeSession() {
  const jar = await cookies();
  const value = jar.get(cookieName)?.value;
  if (value) await db().session.deleteMany({ where: { token: hash(value) } });
  jar.delete(cookieName);
}
