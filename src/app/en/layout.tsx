"use client";

import type { ReactNode } from "react";

// English route wrapper. Sets dir="ltr" at the div level for CSS direction.
// The <html> lang/dir attributes are corrected by HtmlLangDir (client-side) in the root layout.
export default function EnLayout({ children }: { children: ReactNode }) {
  return <div lang="en-US" dir="ltr">{children}</div>;
}
