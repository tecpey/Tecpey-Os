import fs from 'fs';
import path from 'path';

const appDir = path.join(process.cwd(), 'src/app');
const pages = new Set();
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (item.name === 'page.tsx') {
      let route = '/' + path.relative(appDir, path.dirname(full)).replaceAll(path.sep, '/');
      if (route === '/.') route = '/';
      pages.add(route);
    }
  }
}
walk(appDir);
const missing = [];
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
function scan(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) scan(full);
    else if (/\.(tsx|ts)$/.test(item.name)) {
      const text = fs.readFileSync(full, 'utf8');
      const matches = [...text.matchAll(/href(?:=|:)\s*[{]?['"]([^'"?#$]+)(?:[?#][^'"]*)?['"]/g)];
      for (const [, href] of matches) {
        if (!href.startsWith('/')) continue;
        if (href.includes('[')) continue;
        const clean = href === '/' ? '/' : href.replace(/\/$/, '');
        if (!routeExists(clean)) missing.push(`${href} -> ${path.relative(process.cwd(), full)}`);
      }
    }
  }
}
scan(path.join(process.cwd(), 'src'));
if (missing.length) {
  console.error('Missing internal routes:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}
console.log(`Route QA passed. ${pages.size} pages indexed.`);
