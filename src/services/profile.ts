"use server";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";

export const getProfileInfo = async () => {
  const session = await getSession();

  if (!session) return null;

  const res = await apiFetch("/dashboard/profile", {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch profile");
  }

  const data = await res.json();

  return data?.data;
};