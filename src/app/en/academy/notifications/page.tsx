import type { Metadata } from "next";
import { NotificationCenter } from "@/components/learning-os/NotificationCenter";

export const metadata: Metadata = {
  title: "TecPey Notification Center | Academy",
  description:
    "Review verified Academy, Trading Arena, Mentor, security and support notifications in one private notification center.",
  robots: { index: false, follow: false },
};

export default function EnglishAcademyNotificationsPage() {
  return (
    <main
      dir="ltr"
      className="min-h-screen bg-slate-950 px-4 py-12 text-white"
    >
      <section className="mx-auto max-w-4xl rounded-[34px] border border-cyan-300/20 bg-gradient-to-br from-cyan-500/15 to-violet-500/10 p-6 md:p-8">
        <p className="text-sm font-black text-cyan-100">
          TecPey Notification Center
        </p>
        <h1 className="mt-3 text-3xl font-black">Your verified notifications</h1>
        <p className="mt-4 text-sm font-bold leading-8 text-slate-300">
          Review server-owned Academy, Arena, Mentor, security and support
          messages. External delivery channels are not presented as active until
          their providers, consent controls and delivery evidence are certified.
        </p>
        <div className="mt-8">
          <NotificationCenter locale="en" compact />
        </div>
      </section>
    </main>
  );
}
