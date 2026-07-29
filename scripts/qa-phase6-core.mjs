import fs from "fs";
import path from "path";

const root = process.cwd();
const required = [
  "src/lib/community-career.ts",
  "src/app/api/community/profile/route.ts",
  "src/app/api/community/hall-of-fame/route.ts",
  "src/app/api/career/route.ts",
  "src/app/api/challenges/route.ts",
  "src/components/community/CommunityCareerPanel.tsx",
  "src/app/academy/community/page.tsx",
  "src/app/academy/career/page.tsx",
  "src/app/academy/challenges/page.tsx",
  "src/app/student/[studentId]/page.tsx",
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error("Phase 6 missing files:\n" + missing.join("\n"));
  process.exit(1);
}
const forbiddenUi = [/fake/i, /prototype/i, /demo feeling/i, /placeholder/i];
const scanFiles = required.filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"));
const hits = [];
for (const file of scanFiles) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  for (const pattern of forbiddenUi) {
    if (pattern.test(text)) hits.push(`${file}: ${pattern}`);
  }
}
if (hits.length) {
  console.error("Phase 6 product-language QA failed:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("Phase 6 Community + Career QA passed.");
