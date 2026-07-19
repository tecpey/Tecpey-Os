import { spawn } from "node:child_process";

const mode = process.argv.includes("--dev") ? "development" : "production";
const port = mode === "development" ? 3181 : 3182;
const baseUrl = `http://127.0.0.1:${port}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = mode === "development" ? ["run", "dev"] : ["run", "start"];

let output = "";
const child = spawn(npmCommand, npmArgs, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: mode,
    REDIS_URL: mode === "development" ? "" : (process.env.REDIS_URL ?? ""),
    NEXT_PUBLIC_API_BACKEND_URL: "",
    NEXT_PUBLIC_API_SOCKET_URL: "",
    NEXT_PUBLIC_API_URL: "",
    NEXT_PUBLIC_EXTRA_CONNECT_SRC: "",
  },
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
});

for (const stream of [child.stdout, child.stderr]) {
  stream?.on("data", (chunk) => {
    output = `${output}${String(chunk)}`.slice(-30_000);
  });
}

function stopServer() {
  if (child.killed) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

async function fetchWithDeadline(url, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "text/html, text/css;q=0.9, */*;q=0.8" },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForRoot() {
  const deadline = Date.now() + 120_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`TecPey ${mode} server exited with ${child.exitCode}.\n${output}`);
    }
    try {
      const response = await fetchWithDeadline(`${baseUrl}/`, 10_000);
      if (response.status === 200) return response;
      lastError = new Error(`root returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`TecPey ${mode} server did not become ready: ${lastError}\n${output}`);
}

function stylesheetLinks(html) {
  const links = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/rel=["']stylesheet["']/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) links.push(href.replaceAll("&amp;", "&"));
  }
  return links;
}

function inlineStyles(html) {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1])
    .join("\n");
}

async function collectCss(html) {
  let css = inlineStyles(html);
  const links = stylesheetLinks(html);
  console.log(`UI runtime: discovered ${links.length} linked stylesheet(s) and ${css.length} inline CSS bytes.`);
  for (const href of links) {
    const url = new URL(href, baseUrl);
    const response = await fetchWithDeadline(url, 20_000);
    if (!response.ok) throw new Error(`stylesheet ${url} returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/css")) {
      throw new Error(`stylesheet ${url} returned invalid content-type: ${contentType}`);
    }
    const stylesheet = await response.text();
    console.log(`UI runtime: loaded ${url.pathname} (${stylesheet.length} bytes, ${contentType}).`);
    css += `\n${stylesheet}`;
  }
  if (!css.trim()) {
    throw new Error("root HTML contained neither inline CSS nor stylesheet links");
  }
  return { css, links };
}

async function assertPublicRoute(path, expectedText) {
  const response = await fetchWithDeadline(`${baseUrl}${path}`);
  if (response.status !== 200) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  const html = await response.text();
  if (!html.includes(expectedText)) {
    throw new Error(`${path} did not contain expected rendered content: ${expectedText}`);
  }
  if (stylesheetLinks(html).length === 0 && inlineStyles(html).trim().length === 0) {
    throw new Error(`${path} rendered without a stylesheet reference or inline CSS`);
  }
  console.log(`UI runtime: ${path} rendered with the expected public marker.`);
}

try {
  console.log(`UI runtime: starting isolated ${mode} server on ${baseUrl}.`);
  const response = await waitForRoot();
  const html = await response.text();
  console.log(`UI runtime: root returned ${html.length} HTML bytes.`);

  for (const required of [
    "tecpey-enterprise",
    "تک‌پی، نقطه امن ورود به بازار رمزارز",
    "آکادمی رایگان",
  ]) {
    if (!html.includes(required)) {
      throw new Error(`root HTML is missing required rendered marker: ${required}`);
    }
  }

  const { css, links } = await collectCss(html);
  for (const token of [
    "--tp-bg",
    "--tp-surface",
    "--tp-card",
    "--tp-text",
    "--tp-muted",
    "--tp-primary",
    "--tp-border",
  ]) {
    if (!css.includes(token)) throw new Error(`generated CSS is missing ${token}`);
  }

  if (!/display\s*:\s*grid/i.test(css)) {
    throw new Error("generated CSS is missing Tailwind grid utilities");
  }
  if (!/border-radius\s*:/i.test(css)) {
    throw new Error("generated CSS is missing Tailwind/component rounded surfaces");
  }

  await assertPublicRoute("/markets", "مارکت");
  await assertPublicRoute("/academy/login", "آکادمی");

  console.log(
    `Frontend ${mode} runtime style smoke passed: root and public routes rendered with ${links.length} linked stylesheet(s) plus inline CSS.`,
  );
} catch (error) {
  console.error(`Frontend ${mode} runtime style smoke failed.`);
  console.error(error instanceof Error ? error.stack : error);
  console.error("\nServer output:\n" + output);
  process.exitCode = 1;
} finally {
  stopServer();
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
