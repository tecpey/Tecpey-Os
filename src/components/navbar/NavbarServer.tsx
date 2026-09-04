import Navbar, { type User } from "./Navbar";

/**
 * Resolves the profile promise the layout starts but does not await, inside
 * its own Suspense boundary. The layout's static shell — logo, links, page
 * content, footer — no longer waits on a network round trip to
 * /dashboard/profile before sending any HTML; only this thin slice does.
 */
export default async function NavbarServer({
  userPromise,
}: {
  userPromise: Promise<User | null>;
}) {
  const user = await userPromise;
  return <Navbar user={user} />;
}
