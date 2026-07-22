#!/usr/bin/env node

// Simple wrapper to run the TypeScript local signaling server
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsNode = path.join(__dirname, 'node_modules', '.bin', 'ts-node');
const serverPath = path.join(__dirname, 'src', 'local-server', 'index.ts');
const port = process.env.PORT || 3001;

console.log('Starting local signaling server on port', port);
console.log('Server file:', serverPath);

// Use tsx for ESM support
const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx');
const executor = fs.existsSync(tsxPath) ? tsxPath : tsNode;

if (!fs.existsSync(executor)) {
  console.error(
    'ts-node or tsx not found. Please install tsx: pnpm add -D tsx'
  );
  process.exit(1);
}

execSync(`${executor} ${serverPath}`, { stdio: 'inherit' });
