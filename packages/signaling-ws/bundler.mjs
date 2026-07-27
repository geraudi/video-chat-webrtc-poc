import fs from 'node:fs';
import * as esbuild from 'esbuild';

const distDir = 'dist';

// One entry per Lambda; esbuild mirrors src/<fn>/index.ts to dist/<fn>/index.js,
// the layout the Pulumi FileArchive assets expect.
const entryPoints = [
  './src/ws-connect/index.ts',
  './src/ws-disconnect/index.ts',
  './src/ws-hang-up/index.ts',
  './src/ws-new-ice-candidate/index.ts',
  './src/ws-video-answer/index.ts',
  './src/ws-video-offer/index.ts',
  './src/ws-start/index.ts'
];

// Wipe dist so Pulumi never zips stale artifacts from a previous layout
fs.rmSync(distDir, { recursive: true, force: true });

const result = await esbuild.build({
  entryPoints,
  bundle: true,
  outdir: distDir,
  platform: 'node',
  target: 'node20',
  // No `format`: defaults to CJS, which the Lambda runtime loads without
  // an ESM package.json marker and where require() of built-ins just works
  minify: true,
  // .map files ship in the zip so NODE_OPTIONS=--enable-source-maps
  // (set by the infra) produces readable stack traces
  sourcemap: true,
  metafile: true
});

if (result.metafile) {
  // use https://bundle-buddy.com/esbuild to analyse
  fs.mkdirSync('./bundles', { recursive: true });
  fs.writeFileSync('./bundles/metafile.json', JSON.stringify(result.metafile));
}

console.log(`Build complete. Lambda functions are in ${distDir}/ directory.`);
