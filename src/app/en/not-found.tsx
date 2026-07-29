import Link from "next/link";

export default function EnNotFound() {
  return (
    <main dir="ltr" lang="en-US" className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-6xl font-black text-cyan-500">404</h1>
      <h2 className="text-2xl font-bold">Page not found</h2>
      <p className="max-w-md text-[color:var(--tp-muted)]">
        The page you are looking for does not exist or has been moved.
      </p>
      <div className="flex gap-4">
        <Link
          href="/en"
          className="rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-black text-white hover:bg-cyan-400"
        >
          Go to TecPey Home
        </Link>
        <Link
          href="/en/academy"
          className="rounded-2xl border border-cyan-300/30 px-6 py-3 text-sm font-black hover:border-cyan-300/60"
        >
          Free Academy
        </Link>
      </div>
    </main>
  );
}
