import fs from 'fs';
import path from 'path';

const root = process.cwd();
const appDir = path.join(root, 'src/app');
const pages = new Set();
const issues = [];

function read(file) { return fs.readFileSync(file, 'utf8'); }
function walk(dir, cb) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === '.next') continue;
      walk(full, cb);
    } else cb(full);
  }
}

walk(appDir, (file) => {
  if (path.basename(file) === 'page.tsx' && !file.includes(`${path.sep}api${path.sep}`)) {
    let route = '/' + path.relative(appDir, path.dirname(file)).replaceAll(path.sep, '/');
    if (route === '/.') route = '/';
    pages.add(route.replace(/\/$/, '') || '/');
  }
});

function routeExists(href) {
  const route = (href.split(/[?#]/)[0].replace(/\/$/, '') || '/');
  if (pages.has(route)) return true;
  const a = route === '/' ? [] : route.slice(1).split('/');
  for (const page of pages) {
    const b = page === '/' ? [] : page.slice(1).split('/');
    if (a.length === b.length && b.every((seg, i) => seg === a[i] || /^\[[^/]+\]$/.test(seg))) return true;
  }
  return false;
}

walk(path.join(root, 'src'), (file) => {
  if (!/\.(tsx|ts)$/.test(file)) return;
  const text = read(file);
  for (const match of text.matchAll(/href\s*[:=]\s*{?\s*["']([^"'#$]+)(?:[?#][^"']*)?["']/g)) {
    const href = match[1];
    if (href.startsWith('/') && !href.startsWith('//') && !href.includes('[') && !routeExists(href)) {
      issues.push({ type: 'missing-internal-route', file: path.relative(root, file), value: href });
    }
  }
  for (const match of text.matchAll(/(?:src|image)\s*[:=]\s*{?\s*["'](\/[^"']+)["']/g)) {
    const asset = match[1].split('?')[0];
    if (/^\/(images|assets|favicon|site\.webmanifest)/.test(asset) && !fs.existsSync(path.join(root, 'public', asset))) {
      issues.push({ type: 'missing-public-asset', file: path.relative(root, file), value: asset });
    }
  }
  if (file.includes(`${path.sep}src${path.sep}app${path.sep}en${path.sep}`) && /[\u0600-\u06FF]/.test(text)) {
    issues.push({ type: 'persian-text-inside-en-route', file: path.relative(root, file) });
  }
  if (/TODO|FIXME|lorem ipsum/i.test(text)) {
    issues.push({ type: 'unfinished-marker', file: path.relative(root, file) });
  }
});

for (const required of ['public/site.webmanifest', 'public/images/tecpey-logo.png']) {
  if (!fs.existsSync(path.join(root, required))) issues.push({ type: 'missing-required-file', file: required });
}
let sitemapUrls = [];
const sitemapFile = path.join(root, 'src/app/sitemap.ts');
if (!fs.existsSync(path.join(root, 'src/app/robots.ts'))) issues.push({ type: 'missing-dynamic-robots', file: 'src/app/robots.ts' });
if (!fs.existsSync(sitemapFile)) {
  issues.push({ type: 'missing-dynamic-sitemap', file: 'src/app/sitemap.ts' });
} else {
  const sitemapText = read(sitemapFile);
  const literalPaths = [...sitemapText.matchAll(/"(\/?[a-z0-9][a-z0-9\/-]*)"/gi)].map((m) => m[1]).filter((item) => item === '' || item.startsWith('/'));
  const dynamicSignals = [...sitemapText.matchAll(/\.map\(\(/g)].length;
  sitemapUrls = Array.from(new Set(literalPaths));
  if (sitemapUrls.length + dynamicSignals < 25) issues.push({ type: 'thin-sitemap', file: 'src/app/sitemap.ts', value: String(sitemapUrls.length) });
}

const report = {
  status: issues.length ? 'failed' : 'passed',
  checkedAt: new Date().toISOString(),
  pagesIndexed: pages.size,
  sitemapUrls: sitemapUrls.length,
  issues,
};
fs.mkdirSync(path.join(root, 'docs/internal-qa'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/internal-qa/QA_STATIC_PRODUCTION_REPORT.json'), JSON.stringify(report, null, 2));
if (issues.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Static production QA passed: ${pages.size} routes, ${sitemapUrls.length} sitemap URLs, 0 issues.`);
