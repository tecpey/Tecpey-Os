import { redirect } from "next/navigation";

export function generateStaticParams() {
  return [];
}

export default function MentorQuestionGuideRedirectPage() {
  redirect("/academy/ai-guide#mentor-chat");
}
