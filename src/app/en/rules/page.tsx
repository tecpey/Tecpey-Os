import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, Scale, ShieldCheck, WalletCards } from "lucide-react";
import { EnglishShell, EnglishHero } from "../components/EnglishUI";

export const metadata: Metadata = {
  title: "Rules and user responsibilities | TecPey",
  description: "TecPey rules for account safety, spot trading, deposits, withdrawals, fees, prohibited behavior and responsible crypto education.",
  alternates: { canonical: "https://tecpey.ir/en/rules" },
};

const rules = [
  { icon: ShieldCheck, title: "1. Account security", text: "You are responsible for protecting your password, two-factor authentication and account access. TecPey never asks for seed phrases, private keys, passwords or 2FA codes." },
  { icon: WalletCards, title: "2. Deposits, withdrawals and networks", text: "Before any transfer, review the asset, network, destination address, Memo/Tag, fee and minimum amount. Wrong-network transfers may be irreversible." },
  { icon: Scale, title: "3. Spot trading responsibility", text: "Crypto markets are volatile. Market and limit orders should be used with an understanding of risk, liquidity and fees. TecPey does not provide buy/sell signals or guaranteed profit advice." },
  { icon: FileText, title: "4. Identity and permitted use", text: "When verification is required, information must be accurate and belong to you. Account sharing, impersonation and attempts to bypass security controls are not allowed." },
  { icon: AlertTriangle, title: "5. Prohibited behavior", text: "Phishing, bug abuse, false information, unauthorized access attempts, suspicious activity, money laundering or illegal use of TecPey can lead to restrictions." },
  { icon: CheckCircle2, title: "6. Learn before trading", text: "If you do not understand fees, seed phrases, market orders, volatility or risk management, review TecPey Academy and ask the AI Mentor before acting." },
];

export default function RulesPage() {
  return (
    <EnglishShell>
      <EnglishHero eyebrow="Rules" title="Clear rules for safer crypto access" description="Know your responsibilities, risks and safety steps before signing up, depositing, withdrawing or trading." ctaHref="/en/academy" ctaLabel="Learn first" secondaryHref="/en/start-guide" secondaryLabel="Start guide" />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2">
          {rules.map((item) => (
            <article key={item.title} className="rounded-[30px] border border-cyan-300/15 bg-[#06111f] p-6 text-white shadow-[0_20px_70px_rgba(0,0,0,.18)]">
              <item.icon className="h-8 w-8 text-cyan-300" />
              <h2 className="mt-5 text-xl font-black leading-8">{item.title}</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{item.text}</p>
            </article>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-7xl rounded-[30px] border border-amber-300/25 bg-amber-300/10 p-6 text-amber-100">
          <h2 className="text-xl font-black">Important reminder</h2>
          <p className="mt-3 text-sm font-bold leading-7">When you are unsure, ask the TecPey AI Mentor or review the related academy lesson before transferring funds or placing an order.</p>
          <Link href="/en/academy/ai-guide" className="mt-5 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white">Ask AI Mentor</Link>
        </div>
      </section>
    </EnglishShell>
  );
}
