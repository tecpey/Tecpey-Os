import type { Metadata } from "next";
import ExchangeCompareClient from "@/components/content/ExchangeCompareClient";

export const metadata: Metadata = { title: 'TecPey vs Local and Global Exchanges', description: 'A detailed comparison of TecPey with local and global exchanges.' };
export default function Page() { return <ExchangeCompareClient locale="en" />; }
