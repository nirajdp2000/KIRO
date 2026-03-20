/**
 * Vercel Serverless Entry Point
 *
 * All requests (frontend + API) are handled here in production.
 * The Express app is initialised once per cold start and reused.
 */

// Mark as serverless before importing server
process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';

import { startServerlessApp } from '../server';
import type { IncomingMessage, ServerResponse } from 'http';

let appPromise: Promise<(req: IncomingMessage, res: ServerResponse) => void> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = startServerlessApp() as Promise<any>;
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const expressApp = await getApp();
  return expressApp(req, res);
}
