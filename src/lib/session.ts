"use server";

import { cookies } from "next/headers";
import { jwtVerify, type JWTPayload } from "jose";
import { COOKIES } from "./platform-config";

function sessionKey(): Uint8Array | null {
  const secret = process.env.TECPEY_SESSION_SECRET;
  if (!secret || secret.length < 24) return null;
  return new TextEncoder().encode(secret);
}

export async function decrypt(token: string): Promise<JWTPayload | null> {
  const key = sessionKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

/** Return the verified raw access token for server-to-server forwarding. */
export async function getSessionToken(): Promise<string | null> {
  const token = (await cookies()).get(COOKIES.SESSION)?.value;
  if (!token) return null;
  return (await decrypt(token)) ? token : null;
}

export async function getSession(): Promise<JWTPayload | null> {
  const token = await getSessionToken();
  return token ? decrypt(token) : null;
}
