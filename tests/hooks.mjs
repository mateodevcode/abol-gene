import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const src = path.join(process.cwd(), 'src');

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@' || specifier.startsWith('@/')) {
    const base = path.join(src, specifier.slice(specifier === '@' ? 1 : 2));
    const candidates = [base + '.js', path.join(base, 'index.js'), base];
    for (const c of candidates) {
      try {
        if (fs.statSync(c).isFile()) return nextResolve(pathToFileURL(c).href, context);
      } catch { /* siguiente */ }
    }
  }
  return nextResolve(specifier, context);
}
