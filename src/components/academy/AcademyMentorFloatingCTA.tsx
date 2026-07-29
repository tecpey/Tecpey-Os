type AcademyMentorFloatingCTAProps = {
  locale?: "fa" | "en";
};

// Kept for backwards compatibility with academy layouts.
// The real floating mentor is mounted globally in src/app/layout.tsx via GlobalAiMentorWidget.
export function AcademyMentorFloatingCTA(_props: AcademyMentorFloatingCTAProps) {
  return null;
}
