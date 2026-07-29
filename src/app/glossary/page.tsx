import type { Metadata } from "next";
import GlossaryClient from "@/components/content/GlossaryClient";

export const metadata: Metadata = {
  title: 'واژه\u200cنامه تخصصی رمزارز تک\u200cپی',
  description: 'واژه\u200cنامه کامل رمزارز با تعریف، مثال و ریسک.',
};

export default function Page() {
  return <GlossaryClient locale="fa" />;
}
