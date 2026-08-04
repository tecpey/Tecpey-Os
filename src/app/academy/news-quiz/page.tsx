import type { Metadata } from "next";
import { NewsQuizBoard } from "@/components/academy/NewsQuizBoard";
import { ContentShell } from "@/components/content/ContentUI";

export const metadata: Metadata = {
  title: "کوییز هوشمند خبری آکادمی تک‌پی | تمرین ریسک‌محور با اخبار روز کریپتو",
  description:
    "کوییز هوشمند تک‌پی خبرهای واقعی امروزِ بازار رمزارز را به سؤال‌های ریسک‌محور و آموزشی تبدیل می‌کند؛ بدون وعده سود و پیش‌بینی قیمت.",
  alternates: { canonical: "https://tecpey.ir/academy/news-quiz" },
};

export default function NewsQuizPage() {
  return (
    <ContentShell>
      <main className="py-12">
        <NewsQuizBoard locale="fa" />
      </main>
    </ContentShell>
  );
}
