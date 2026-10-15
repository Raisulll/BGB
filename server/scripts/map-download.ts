// Specs #8, #18 — builds the offline map file MAP_DIR/bangladesh.pmtiles (see src/map.ts).
//
//   npm run map:download                 # latest Protomaps build, zoom 0-14 (about 340 MB)
//   npm run map:download -- --maxzoom=13 # smaller file (about 180 MB), less street detail
//
// Needs internet once, on any machine; the file is then copied to the BIRDS server, which needs no
// internet. It downloads the official pmtiles tool (github.com/protomaps/go-pmtiles) into
// MAP_DIR/.bin and extracts the area BIRDS shows (src/lib/leaflet.js BD_LIMIT) from the daily
// Protomaps build of OpenStreetMap (data © OpenStreetMap contributors, ODbL).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';

const PMTILES_VERSION = '1.31.2';
const BBOX = '87.0,19.7,93.75,27.6'; // west,south,east,north = BD_LIMIT in BGB/src/lib/leaflet.js
const maxzoom = Number(process.argv.find((a) => a.startsWith('--maxzoom='))?.split('=')[1] ?? 14);

const dir = path.resolve(env.MAP_DIR);
const bin = path.join(dir, '.bin');
mkdirSync(bin, { recursive: true });

const asset = {
  win32: `go-pmtiles_${PMTILES_VERSION}_Windows_x86_64.zip`,
  linux: `go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz`,
  darwin: `go-pmtiles-${PMTILES_VERSION}_Darwin_x86_64.zip`,
}[process.platform as 'win32' | 'linux' | 'darwin'];
if (!asset) throw new Error(`No pmtiles build for ${process.platform}`);
const exe = path.join(bin, process.platform === 'win32' ? 'pmtiles.exe' : 'pmtiles');

async function main() {
  if (!existsSync(exe)) {
    console.log(`Downloading the pmtiles tool ${PMTILES_VERSION}…`);
    const res = await fetch(`https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/${asset}`);
    if (!res.ok) throw new Error(`pmtiles download failed: HTTP ${res.status}`);
    const archive = path.join(bin, asset);
    writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
    execFileSync('tar', ['-xf', archive, '-C', bin]); // tar reads zip too (Windows 10+, macOS)
    rmSync(archive);
  }

  const builds = (await (await fetch('https://build-metadata.protomaps.dev/builds.json')).json()) as { key: string }[];
  const latest = builds[builds.length - 1]!.key;
  const out = path.join(dir, 'bangladesh.pmtiles');
  const tmp = `${out}.part`;
  console.log(`Extracting ${BBOX}, zoom 0-${maxzoom}, from Protomaps build ${latest}…`);
  execFileSync(exe, ['extract', `https://build.protomaps.com/${latest}`, tmp, `--bbox=${BBOX}`, `--maxzoom=${maxzoom}`], { stdio: 'inherit' });
  renameSync(tmp, out); // the server keeps serving the old file until the new one is complete
  console.log(`Written ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
