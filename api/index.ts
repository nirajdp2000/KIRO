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

type AppHandler = (req: IncomingMessage, res: ServerResponse) => void;

let appPromise: Promise<AppHandler> | null = null;

function getApp(): Promise<AppHandler> {
  if (!appPromise) {
    appPromise = import('../server.js').then((mod) =>
      mod.startServerlessApp() as Promise<AppHandler>
    );
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const expressApp = await getApp();
  return expressApp(req, res);
}
