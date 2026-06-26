import type { Metadata } from "next";
import TradingToolsClient from "@/components/tools/TradingToolsClient";

export const metadata: Metadata = { title: 'جعبه ابزار معامله\u200cگر تک\u200cپی', description: 'ابزارهای حرفه\u200cای رمزارز همراه با توضیح و لینک رسمی.' };
export default function Page() { return <TradingToolsClient locale="fa" />; }
