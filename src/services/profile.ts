"use server";

import { headers } from "next/headers";
import { apiFetch } from "@/lib/api";
import {
  isProfileFreeRoute,
  REQUEST_ROUTE_CONTEXT_HEADER,
} from "@/lib/request-route-context";
import { getSession } from "@/lib/session";

export const getProfileInfo = async () => {
  const requestHeaders = await headers();
  const requestPath = requestHeaders.get(REQUEST_ROUTE_CONTEXT_HEADER);

  if (isProfileFreeRoute(requestPath)) return null;

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
