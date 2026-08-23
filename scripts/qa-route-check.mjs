import fs from 'fs';
import path from 'path';
import { enumerateRoutePatterns } from './screenshot-matrix-routes.mjs';

// One enumeration, shared with the QA-050 screenshot matrix. This used to walk
// src/app itself, which meant two modules independently decided what "a route"
// is — and the launch ledger's 175 agreed with them only by coincidence.
const pages = new Set(enumerateRoutePatterns());
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
