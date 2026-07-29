import type { Metadata } from "next";
import TradingToolsClient from "@/components/tools/TradingToolsClient";

export const metadata: Metadata = { title: 'TecPey Trader Toolbox', description: 'Professional crypto tools with official links and usage notes.' };
export default function Page() { return <TradingToolsClient locale="en" />; }
