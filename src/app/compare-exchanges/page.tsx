import type { Metadata } from "next";
import ExchangeCompareClient from "@/components/content/ExchangeCompareClient";

export const metadata: Metadata = { title: 'مقایسه تک\u200cپی با صرافی\u200cهای داخلی و جهانی', description: 'مقایسه کامل تک\u200cپی با صرافی\u200cهای داخلی و جهانی.' };
export default function Page() { return <ExchangeCompareClient locale="fa" />; }
