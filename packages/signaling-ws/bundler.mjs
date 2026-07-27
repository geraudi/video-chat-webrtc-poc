import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = 'dist';
const pkgRoot = __dirname;

// Lambda function names (matching Pulumi infrastructure)
const LAMBDA_FUNCTIONS = [
  'ws-connect',
  'ws-disconnect',
  'ws-hang-up',
  'ws-new-ice-candidate',
  'ws-video-answer',
  'ws-video-offer',
  'ws-start'
];

// Source entry points mapping to output directories
const ENTRY_POINTS = {
  'ws-connect': './src/ws-connect/index.ts',
  'ws-disconnect': './src/ws-disconnect/index.ts',
  'ws-hang-up': './src/ws-hang-up/index.ts',
  'ws-new-ice-candidate': './src/ws-new-ice-candidate/index.ts',
  'ws-video-answer': './src/ws-video-answer/index.ts',
  'ws-video-offer': './src/ws-video-offer/index.ts',
  'ws-start': './src/ws-start/index.ts'
};

// Plugin to bundle Node.js built-in modules instead of marking them external
// This is required for Lambda ESM runtime where dynamic require() of built-ins fails
function bundleNodeBuiltinsPlugin() {
  // List of Node.js built-in modules that need to be bundled
  const nodeBuiltins = [
    'events', 'fs', 'path', 'url', 'util', 'stream', 'buffer',
    'crypto', 'os', 'assert', 'constants', 'domain', 'http',
    'https', 'net', 'tls', 'tty', 'v8', 'vm', 'zlib', 'worker_threads',
    'child_process', 'cluster', 'dgram', 'dns', 'module', 'perf_hooks'
  ];

  return {
    name: 'bundle-node-builtins',
    setup(build) {
      // Intercept imports of Node.js built-ins and bundle them instead of marking external
      build.onResolve({ filter: new RegExp(`^(${nodeBuiltins.join('|')})$`) }, (args) => {
        return { path: args.path, namespace: 'node-builtin' };
      });

      // Resolve Node.js built-ins to bundled shim files
      for (const builtin of nodeBuiltins) {
        build.onLoad({ filter: new RegExp(`^${builtin}$`), namespace: 'node-builtin' }, () => ({
          contents: '',
          loader: 'js'
        }));
      }
    }
  };
}

async function build() {
  // Build all Lambda functions individually
  for (const [funcName, entryPoint] of Object.entries(ENTRY_POINTS)) {
    const funcDistDir = path.join(distDir, funcName);

    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      outfile: path.join(funcDistDir, 'index.js'),
      // Only exclude what's truly available in Lambda runtime
      external: ['aws-lambda', '@aws-sdk/*'],
      // Bundle Node.js built-ins to avoid "Dynamic require" errors in Lambda ESM
      plugins: [bundleNodeBuiltinsPlugin()],
      minify: true,
      sourcemap: false,
      treeShaking: true,
      metafile: true
    });

    console.log(`Built ${funcName}`);
  }

  // Copy package.json to each function directory for module resolution
  const rootPkgJson = path.join(pkgRoot, 'package.json');
  if (fs.existsSync(rootPkgJson)) {
    const pkgContent = fs.readFileSync(rootPkgJson, 'utf-8');
    for (const func of LAMBDA_FUNCTIONS) {
      const funcDistDir = path.join(distDir, func);
      await fs.promises.writeFile(path.join(funcDistDir, 'package.json'), pkgContent);
    }
  }

  console.log(`\nBuild complete. Lambda functions are in ${distDir}/ directory.`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});