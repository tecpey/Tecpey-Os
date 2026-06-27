"use client";

import { useRouter } from "next/navigation";
import { LessonPlayerV2 } from "./LessonPlayerV2";
import type { Lesson } from "@/data/academy/term1Curriculum";

type Props = { lesson: Lesson; nextPath: string };

export function LessonPlayerV2Client({ lesson, nextPath }: Props) {
  const router = useRouter();
  return (
    <LessonPlayerV2
      lesson={lesson}
      onComplete={() => undefined}
      onNext={() => router.push(nextPath)}
    />
  );
}
