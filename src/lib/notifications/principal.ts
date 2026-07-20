import { getCanonicalSession } from "../auth-session";

export type NotificationIdentity = {
  studentId: string;
  userId: string | null;
  email: string | null;
};

export async function getNotificationIdentityFromRequest(
  request: Request,
  options: { strictRevocation?: boolean } = {},
): Promise<NotificationIdentity | null> {
  const session = await getCanonicalSession(request, {
    strictRevocation: options.strictRevocation === true,
  });
  if (!session.studentId) return null;
  return {
    studentId: session.studentId,
    userId: session.userId,
    email: session.email,
  };
}
