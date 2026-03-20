/**
 * UpstoxTokenManager — Token storage and auto-refresh logic
 *
 * Storage strategy (platform-agnostic):
 *   • Primary:  SQLite (local dev, Railway, Render — any platform with a writable filesystem)
 *   • Fallback: In-memory + UPSTOX_ACCESS_TOKEN env var (Vercel serverless, read-only FS)
 *
 * better-sqlite3 is imported at the top level but wrapped in try/catch so the module
 * loads cleanly on Vercel where the native addon is unavailable.
 */

import axios from 'axios';
import path from 'path';
import { createRequire } from 'module';

interface TokenRecord {
  access_token: string;
  refresh_token: string | null;
  expires_at: number; // Unix timestamp ms
}

// ─── SQLite setup (graceful fallback if unavailable) ─────────────────────────

type SqliteDB = {
  exec: (sql: string) => void;
  prepare: (sql: string) => { run: (...args: any[]) => void; get: () => any };
};

let db: SqliteDB | null = null;

try {
  const _require = createRequire(import.meta.url);
  const Database = _require('better-sqlite3');
  const dbPath = path.join(process.cwd(), 'upstox-tokens.db');
  db = new Database(dbPath) as SqliteDB;
  db.exec(`
    CREATE TABLE IF NOT EXISTS upstox_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  console.log('[UpstoxTokenManager] SQLite storage initialised');
} catch {
  console.log('[UpstoxTokenManager] SQLite unavailable, using env/memory storage');
}

// ─── In-memory fallback ───────────────────────────────────────────────────────
let memoryToken: TokenRecord | null = null;

function readRecord(): TokenRecord | null {
  if (db) {
    const row = db.prepare('SELECT * FROM upstox_tokens ORDER BY id DESC LIMIT 1').get() as any;
    if (!row) return null;
    return { access_token: row.access_token, refresh_token: row.refresh_token, expires_at: row.expires_at };
  }
  return memoryToken;
}

function writeRecord(r: TokenRecord): void {
  if (db) {
    const now = Date.now();
    db.prepare('DELETE FROM upstox_tokens').run();
    db.prepare(
      'INSERT INTO upstox_tokens (access_token, refresh_token, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(r.access_token, r.refresh_token, r.expires_at, now, now);
  } else {
    memoryToken = r;
  }
}

// ─── Token Manager ────────────────────────────────────────────────────────────

export class UpstoxTokenManager {
  constructor() {
    // Seed from env var on startup — useful for Vercel where token is set as env var
    const envToken = process.env.UPSTOX_ACCESS_TOKEN;
    if (envToken && !readRecord()) {
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // assume 24h
      writeRecord({ access_token: envToken, refresh_token: null, expires_at: expiresAt });
    }
  }

  storeTokens(accessToken: string, refreshToken: string | null, expiresIn: number): void {
    const expiresAt = Date.now() + expiresIn * 1000;
    writeRecord({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt });
    console.log(`[UpstoxTokenManager] Tokens stored | expires=${new Date(expiresAt).toISOString()} | len=${accessToken.length}`);
  }

  private isExpired(expiresAt: number): boolean {
    return Date.now() >= expiresAt - 5 * 60 * 1000; // 5-min buffer
  }

  private async refreshAccessToken(refreshToken: string): Promise<void> {
    const { UPSTOX_CLIENT_ID: clientId, UPSTOX_CLIENT_SECRET: clientSecret, UPSTOX_REDIRECT_URI: redirectUri } = process.env;
    if (!clientId || !clientSecret || !redirectUri) throw new Error('Upstox credentials not configured');

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    const { data } = await axios.post('https://api.upstox.com/v2/login/authorization/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    });

    const { access_token, refresh_token: newRefresh, expires_in } = data;
    if (!access_token) throw new Error('No access_token in refresh response');
    this.storeTokens(access_token, newRefresh || refreshToken, expires_in || 86400);
    console.log('[UpstoxTokenManager] Token refreshed successfully');
  }

  async getValidAccessToken(): Promise<string | null> {
    const record = readRecord();
    if (!record) {
      console.log('[UpstoxTokenManager] No tokens found');
      return null;
    }
    if (this.isExpired(record.expires_at)) {
      if (!record.refresh_token) {
        console.error('[UpstoxTokenManager] Token expired, no refresh token');
        return null;
      }
      try {
        await this.refreshAccessToken(record.refresh_token);
        return readRecord()?.access_token || null;
      } catch (e) {
        console.error('[UpstoxTokenManager] Auto-refresh failed:', e);
        return null;
      }
    }
    const minsLeft = Math.round((record.expires_at - Date.now()) / 60000);
    console.log(`[UpstoxTokenManager] Using valid access token (expires in ${minsLeft}m, length=${record.access_token.length})`);
    return record.access_token;
  }

  async exchangeAuthorizationCode(code: string): Promise<void> {
    const { UPSTOX_CLIENT_ID: clientId, UPSTOX_CLIENT_SECRET: clientSecret, UPSTOX_REDIRECT_URI: redirectUri } = process.env;
    if (!clientId || !clientSecret || !redirectUri) throw new Error('Upstox credentials not configured');

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    const { data } = await axios.post('https://api.upstox.com/v2/login/authorization/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    });

    const { access_token, refresh_token, expires_in } = data;
    if (!access_token) throw new Error('No access_token in response');
    this.storeTokens(access_token, refresh_token || null, expires_in || 86400);
    console.log('[UpstoxTokenManager] Authorization code exchanged successfully');
  }

  close(): void {
    // no-op — connection managed at module level
  }
}
