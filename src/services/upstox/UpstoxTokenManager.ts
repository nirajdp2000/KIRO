/**
 * UpstoxTokenManager — Secure token storage and auto-refresh logic
 * 
 * Responsibilities:
 *   • Store access_token, refresh_token, expires_at in SQLite
 *   • Auto-refresh tokens before expiry
 *   • Provide getValidAccessToken() for API calls
 *   • Handle OAuth flow completion
 */

import Database from 'better-sqlite3';
import axios from 'axios';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'upstox-tokens.db');

interface TokenRecord {
  id: number;
  access_token: string;
  refresh_token: string | null;
  expires_at: number; // Unix timestamp in milliseconds
  created_at: number;
  updated_at: number;
}

export class UpstoxTokenManager {
  private db: Database.Database;

  constructor() {
    // Initialize SQLite database
    this.db = new Database(DB_PATH);
    this.initDatabase();
  }

  /**
   * Create tokens table if it doesn't exist
   */
  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS upstox_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  /**
   * Store new tokens after OAuth callback or refresh
   */
  storeTokens(accessToken: string, refreshToken: string | null, expiresIn: number): void {
    const now = Date.now();
    const expiresAt = now + (expiresIn * 1000); // Convert seconds to milliseconds

    // Delete old tokens (keep only latest)
    this.db.prepare('DELETE FROM upstox_tokens').run();

    // Insert new tokens
    this.db.prepare(`
      INSERT INTO upstox_tokens (access_token, refresh_token, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(accessToken, refreshToken, expiresAt, now, now);

    console.log(`[UpstoxTokenManager] Tokens stored successfully | expires_at=${new Date(expiresAt).toISOString()} | token_length=${accessToken.length}`);
  }

  /**
   * Get stored token record
   */
  private getTokenRecord(): TokenRecord | null {
    const row = this.db.prepare('SELECT * FROM upstox_tokens ORDER BY id DESC LIMIT 1').get();
    return row as TokenRecord | null;
  }

  /**
   * Check if current token is expired or about to expire (within 5 minutes)
   */
  private isTokenExpired(expiresAt: number): boolean {
    const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
    return Date.now() >= (expiresAt - bufferMs);
  }

  /**
   * Refresh access token using refresh_token
   */
  private async refreshAccessToken(refreshToken: string): Promise<void> {
    const clientId = process.env.UPSTOX_CLIENT_ID;
    const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
    const redirectUri = process.env.UPSTOX_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Upstox credentials not configured in .env');
    }

    try {
      console.log('[UpstoxTokenManager] Refreshing access token...');
      
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('redirect_uri', redirectUri);

      const response = await axios.post('https://api.upstox.com/v2/login/authorization/token', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      });

      const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;
      
      // Validate required fields
      if (!access_token) {
        throw new Error('No access_token in refresh response');
      }
      
      // Default to 24 hours if expires_in is not provided
      const expiresIn = expires_in || 86400; // 24 hours in seconds
      
      this.storeTokens(access_token, newRefreshToken || refreshToken, expiresIn);

      console.log('[UpstoxTokenManager] Token refreshed successfully');
    } catch (error: any) {
      console.error('[UpstoxTokenManager] Token refresh failed:', error.response?.data || error.message);
      throw new Error('Failed to refresh Upstox token');
    }
  }

  /**
   * Get a valid access token — auto-refreshes if expired
   * 
   * Returns null if no tokens stored or refresh fails
   */
  async getValidAccessToken(): Promise<string | null> {
    const record = this.getTokenRecord();

    if (!record) {
      console.log('[UpstoxTokenManager] No tokens found in database');
      return null;
    }

    // Check if token is expired
    if (this.isTokenExpired(record.expires_at)) {
      console.log('[UpstoxTokenManager] Token expired, attempting refresh...');

      if (!record.refresh_token) {
        console.error('[UpstoxTokenManager] No refresh token available');
        return null;
      }

      try {
        await this.refreshAccessToken(record.refresh_token);
        // Get the newly refreshed token
        const newRecord = this.getTokenRecord();
        return newRecord?.access_token || null;
      } catch (error) {
        console.error('[UpstoxTokenManager] Auto-refresh failed:', error);
        return null;
      }
    }

    // Token is still valid
    console.log(`[UpstoxTokenManager] Using valid access token (expires in ${Math.round((record.expires_at - Date.now()) / 60000)}m, length=${record.access_token.length})`);
    return record.access_token;
  }

  /**
   * Exchange authorization code for access token (OAuth callback)
   */
  async exchangeAuthorizationCode(code: string): Promise<void> {
    const clientId = process.env.UPSTOX_CLIENT_ID;
    const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
    const redirectUri = process.env.UPSTOX_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Upstox credentials not configured in .env');
    }

    try {
      console.log('[UpstoxTokenManager] Exchanging authorization code...');
      
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('redirect_uri', redirectUri);

      const response = await axios.post('https://api.upstox.com/v2/login/authorization/token', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      });

      console.log('[UpstoxTokenManager] Response received:', JSON.stringify(response.data, null, 2));

      const { access_token, refresh_token, expires_in } = response.data;
      
      // Validate required fields
      if (!access_token) {
        throw new Error('No access_token in response');
      }
      
      // Default to 24 hours if expires_in is not provided
      const expiresIn = expires_in || 86400; // 24 hours in seconds
      
      console.log('[UpstoxTokenManager] Storing tokens with expires_in:', expiresIn);
      
      this.storeTokens(access_token, refresh_token || null, expiresIn);

      console.log('[UpstoxTokenManager] Authorization code exchanged successfully');
    } catch (error: any) {
      const errorDetails = error.response?.data || error.message;
      console.error('[UpstoxTokenManager] Code exchange failed:', errorDetails);
      console.error('[UpstoxTokenManager] Full error:', error);
      throw new Error(`Failed to exchange authorization code: ${JSON.stringify(errorDetails)}`);
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
