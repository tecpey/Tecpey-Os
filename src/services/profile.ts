"use server";

import { headers } from "next/headers";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";
import {
  isProfileFreeRoute,
  REQUEST_ROUTE_CONTEXT_HEADER,
} from "@/lib/request-route-context";
import { getSession } from "@/lib/session";
import type { User } from "@/components/navbar/Navbar";
import { resolveOptionalProfile } from "@/services/optional-profile";

export const getProfileInfo = async () => {
  const requestHeaders = await headers();
  const requestPath = requestHeaders.get(REQUEST_ROUTE_CONTEXT_HEADER);

  if (isProfileFreeRoute(requestPath)) return null;

  const session = await getSession();

  if (!session) return null;

  const result = await resolveOptionalProfile<User>(() =>
    apiFetch("/dashboard/profile", { method: "GET" }),
  );

  if (result.failure) {
    logger.warn("[profile] optional navbar profile unavailable", {
      route: requestPath ?? "unknown",
      ...result.failure,
    });
  }

  return result.data;
};
