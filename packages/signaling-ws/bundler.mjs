import * as esbuild from 'esbuild'
import fs from "fs";

const result = await esbuild.build({
  entryPoints: [
    './src/ws-connect/index.ts',
    './src/ws-disconnect/index.ts',
    './src/ws-hang-up/index.ts',
    './src/ws-new-ice-candidate/index.ts',
    './src/ws-video-answer/index.ts',
    './src/ws-video-offer/index.ts',
    './src/ws-start/index.ts'
  ],
  bundle: true,
  outdir: 'dist',
  platform: 'node',
  target: 'node20',
  minify: true,
  metafile: true,
})

if (result.metafile) {
  // use https://bundle-buddy.com/esbuild to analyses
  await fs.writeFile('./bundles/metafile.json', JSON.stringify(result.metafile), () => {
    console.log('Metafile written to ./bundles/metafile.json');
  });
}
