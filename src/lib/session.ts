"use server";

import { cookies } from "next/headers";
import { jwtVerify } from "jose";

function sessionKey() {
  const secret = process.env.JWT_SECRET || process.env.TECPEY_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 24) return null;
  return new TextEncoder().encode(secret);
}

export async function decrypt(token: string) {
  const key = sessionKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const session = (await cookies()).get("user_session")?.value;
  if (!session) return null;
  return await decrypt(session);
}
