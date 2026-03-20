/**
 * Vercel Serverless Entry Point
 *
 * IMPORTANT: process.env.VERCEL must be set BEFORE server.ts is imported,
 * because server.ts (and its transitive imports like UpstoxTokenManager,
 * PredictionStorageService) check process.env.VERCEL at module evaluation time
 * to decide whether to initialise better-sqlite3.
 *
 * ESM static imports are hoisted and evaluated before any code in this file runs,
 * so we MUST use a dynamic import() to ensure the env var is set first.
 */

process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';

import type { IncomingMessage, ServerResponse } from 'http';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

type AppHandler = (req: IncomingMessage, res: ServerResponse) => void;

let appPromise: Promise<AppHandler> | null = null;
const require = createRequire(path.join(process.cwd(), 'api', 'index.js'));

function resolveServerBundlePath(): string {
  const candidates = [
    path.join(process.cwd(), 'server.cjs'),
    path.join(process.cwd(), '.vercel', 'output', 'functions', 'api', 'index.func', 'server.cjs'),
    path.join(process.cwd(), '..', 'server.cjs'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate server bundle for Vercel. Checked: ${candidates.join(', ')}`);
}

function getApp(): Promise<AppHandler> {
  if (!appPromise) {
    appPromise = Promise.resolve().then(() => {
      const mod = require(resolveServerBundlePath()) as {
        startServerlessApp: () => Promise<AppHandler>;
      };
      return mod.startServerlessApp();
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const expressApp = await getApp();
  return expressApp(req, res);
}
