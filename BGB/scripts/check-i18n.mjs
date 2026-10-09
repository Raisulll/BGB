// Spec #43 — keeps the English and Bangla dictionaries in step and catches unknown keys.
// Usage: npm run i18n:check   (exit code 1 on any problem)
//  - every key in en.js exists in bn.js and vice versa, and no value is empty
//  - every literal t('key') in src/ exists in en.js
//  - every template t(`prefix.${x}`) has at least one key under that prefix
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'src');
const load = async (name) => (await import(pathToFileURL(join(src, 'i18n', name)).href)).default;

const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
};

const en = flatten(await load('en.js'));
const bn = flatten(await load('bn.js'));
const problems = [];

for (const k of Object.keys(en)) if (!(k in bn)) problems.push(`bn.js is missing "${k}"`);
for (const k of Object.keys(bn)) if (!(k in en)) problems.push(`en.js is missing "${k}" (present in bn.js)`);
for (const [name, dict] of [['en', en], ['bn', bn]]) {
  for (const [k, v] of Object.entries(dict)) if (typeof v !== 'string' || !v.trim()) problems.push(`${name}.js has an empty value for "${k}"`);
}
// Placeholders must match, or a translation silently drops a value
for (const k of Object.keys(en)) {
  if (!(k in bn)) continue;
  const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  if (vars(en[k]) !== vars(bn[k])) problems.push(`placeholders differ for "${k}": en {${vars(en[k])}} vs bn {${vars(bn[k])}}`);
}

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'i18n') walk(p);
    } else if (/\.(jsx?|mjs)$/.test(name)) files.push(p);
  }
};
walk(src);

const keys = Object.keys(en);
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\bt\(\s*'([\w.\- /]+)'/g)) {
    if (!(m[1] in en)) problems.push(`${relative(root, file)}: unknown key "${m[1]}"`);
  }
  for (const m of text.matchAll(/\bt\(\s*`([\w.]+)\$\{/g)) {
    if (!keys.some((k) => k.startsWith(m[1]))) problems.push(`${relative(root, file)}: no keys under "${m[1]}*"`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} i18n problem(s).`);
  process.exit(1);
}
console.log(`i18n OK: ${keys.length} keys in both languages, ${files.length} source files checked.`);
