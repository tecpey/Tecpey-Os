import { readFile } from "node:fs/promises";

const [theme, layout, publicMentor, navbar, footer] = await Promise.all([
  readFile("src/components/ThemeToggle.tsx", "utf8"),
  readFile("src/app/layout.tsx", "utf8"),
  readFile("src/components/academy/PublicMentorEntry.tsx", "utf8"),
  readFile("src/components/navbar/Navbar.tsx", "utf8"),
  readFile("src/components/footer/Footer.tsx", "utf8"),
]);

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

requireText(theme, "resolvedTheme", "Theme control must render from next-themes resolvedTheme authority");
requireText(theme, "aria-pressed={isDark}", "Theme control must expose the current state accessibly");
requireText(theme, "تغییر به حالت", "Persian theme action must be explicit rather than icon-only");
requireText(theme, "Switch to", "English theme action must be explicit rather than icon-only");
rejectText(theme, "useState(theme ===", "Theme control must not freeze pre-hydration theme state");

requireText(layout, "<PublicMentorEntry />", "Root layout must expose the public/locked Mentor entry");
requireText(layout, "<GlobalAiMentorWidget />", "Root layout must preserve the personalized Mentor widget");
requireText(publicMentor, 'type ProfileStatus = "checking" | "absent" | "ready" | "unavailable"', "Public Mentor must distinguish absent profile from API failure");
requireText(publicMentor, 'if (profileStatus !== "absent") return null', "Public Mentor must show only after an authoritative absent-profile result");
requireText(publicMentor, 'setProfileStatus("unavailable")', "Mentor profile-check failure must fail closed instead of creating a duplicate launcher");
requireText(publicMentor, "منتور هوشمند تک‌پی", "Public Mentor CTA must be visible in Persian");
requireText(publicMentor, "AI Learning Mentor", "Public Mentor CTA must be visible in English");
requireText(publicMentor, "aria-modal=\"true\"", "Locked Mentor explanation must use dialog semantics");
requireText(publicMentor, 'event.key === "Escape"', "Locked Mentor dialog must support Escape dismissal");
requireText(publicMentor, 'event.key !== "Tab"', "Locked Mentor dialog must contain keyboard focus");
requireText(publicMentor, 'document.body.style.overflow = "hidden"', "Locked Mentor dialog must prevent background scroll");

requireText(navbar, "aria-haspopup=\"menu\"", "Knowledge Center must expose menu semantics");
requireText(navbar, "aria-expanded={knowledgeOpen}", "Knowledge Center must expose open state");
requireText(navbar, "role=\"menu\"", "Knowledge Center panel must use menu semantics");
requireText(navbar, "role=\"menuitem\"", "Knowledge Center links must use menu-item semantics");
requireText(navbar, "absolute end-0", "Knowledge Center must use locale-aware logical alignment");
requireText(navbar, "event.key !== \"Escape\"", "Knowledge Center must support Escape dismissal");
requireText(navbar, "تریدینگ آرنا", "Knowledge navigation must expose Trading Arena");
requireText(navbar, "منتور هوشمند", "Knowledge navigation must expose the AI Mentor");

rejectText(footer, "useScrollReveal", "Footer content must not depend on IntersectionObserver visibility");
rejectText(footer, "opacity: isVisible", "Footer content must never start hidden behind animation state");
rejectText(footer, "E-trust status", "Persian Footer must not contain mixed-language trust labels");
rejectText(footer, "Digital media registration", "Persian Footer must not contain mixed-language registration labels");
requireText(footer, "تریدینگ آرنا", "Footer must expose the Trading Arena product path");
requireText(footer, "منتور هوشمند", "Footer must expose the AI Mentor product path");
requireText(footer, "هنوز نهایی یا تأیید نشده‌اند", "Pending trust signals must be disclosed without implying approval");

if (failures.length) {
  console.error("Public UI foundation check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Public UI foundation check passed: theme, Mentor, Knowledge Center and Footer visibility contracts are present.");
