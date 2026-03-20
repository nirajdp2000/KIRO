/**
 * PredictionStorageService — Store and retrieve stock predictions for accuracy tracking
 * 
 * Storage: SQLite (local) or JSON file (Vercel fallback)
 */

import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

export interface StockPrediction {
  id?: number;
  stock_symbol: string;
  prediction_date: string; // ISO date when prediction was made
  target_date: string; // ISO date for next trading day
  prediction: 'Bullish' | 'Bearish' | 'Neutral';
  confidence: number;
  predicted_price: number;
  actual_price?: number;
  actual_change?: number;
  accuracy?: number;
  signals: {
    RSI: number;
    MACD: number;
    Volume: number;
    Trend: number;
    Sentiment: number;
    Bollinger: number;
    ATR: number;
  };
  explanation: string;
  created_at?: number;
}

type SqliteDB = {
  exec: (sql: string) => void;
  prepare: (sql: string) => any;
};

let db: SqliteDB | null = null;
const JSON_STORE_PATH = path.join(process.cwd(), 'predictions-store.json');

// Initialize SQLite or fallback to JSON
try {
  const _require = createRequire(import.meta.url);
  const Database = _require('better-sqlite3');
  const dbPath = path.join(process.cwd(), 'predictions.db');
  db = new Database(dbPath) as SqliteDB;
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_symbol TEXT NOT NULL,
      prediction_date TEXT NOT NULL,
      target_date TEXT NOT NULL,
      prediction TEXT NOT NULL,
      confidence REAL NOT NULL,
      predicted_price REAL NOT NULL,
      actual_price REAL,
      actual_change REAL,
      accuracy REAL,
      signals TEXT NOT NULL,
      explanation TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  
  db.exec(`CREATE INDEX IF NOT EXISTS idx_target_date ON predictions(target_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_symbol ON predictions(stock_symbol)`);
  
  console.log('[PredictionStorage] SQLite storage initialized');
} catch {
  console.log('[PredictionStorage] Using JSON file storage');
  if (!fs.existsSync(JSON_STORE_PATH)) {
    fs.writeFileSync(JSON_STORE_PATH, JSON.stringify([]));
  }
}

export class PredictionStorageService {
  
  static savePrediction(pred: StockPrediction): void {
    const now = Date.now();
    
    if (db) {
      db.prepare(`
        INSERT INTO predictions (
          stock_symbol, prediction_date, target_date, prediction, confidence,
          predicted_price, signals, explanation, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        pred.stock_symbol,
        pred.prediction_date,
        pred.target_date,
        pred.prediction,
        pred.confidence,
        pred.predicted_price,
        JSON.stringify(pred.signals),
        pred.explanation,
        now
      );
    } else {
      const data = JSON.parse(fs.readFileSync(JSON_STORE_PATH, 'utf-8')) as StockPrediction[];
      data.push({ ...pred, id: data.length + 1, created_at: now });
      fs.writeFileSync(JSON_STORE_PATH, JSON.stringify(data, null, 2));
    }
  }
  
  static getPredictionsByDate(targetDate: string): StockPrediction[] {
    if (db) {
      const rows = db.prepare('SELECT * FROM predictions WHERE target_date = ? ORDER BY confidence DESC').all(targetDate);
      return rows.map((r: any) => ({
        ...r,
        signals: JSON.parse(r.signals),
      }));
    } else {
      const data = JSON.parse(fs.readFileSync(JSON_STORE_PATH, 'utf-8')) as StockPrediction[];
      return data.filter(p => p.target_date === targetDate);
    }
  }
  
  static updateActualPrice(id: number, actualPrice: number, actualChange: number): void {
    if (db) {
      const pred = db.prepare('SELECT * FROM predictions WHERE id = ?').get(id) as any;
      if (!pred) return;
      
      const predictedDirection = pred.prediction === 'Bullish' ? 1 : pred.prediction === 'Bearish' ? -1 : 0;
      const actualDirection = actualChange > 0 ? 1 : actualChange < 0 ? -1 : 0;
      const accuracy = predictedDirection === actualDirection ? 100 : 0;
      
      db.prepare(`
        UPDATE predictions 
        SET actual_price = ?, actual_change = ?, accuracy = ?
        WHERE id = ?
      `).run(actualPrice, actualChange, accuracy, id);
    } else {
      const data = JSON.parse(fs.readFileSync(JSON_STORE_PATH, 'utf-8')) as StockPrediction[];
      const pred = data.find(p => p.id === id);
      if (!pred) return;
      
      const predictedDirection = pred.prediction === 'Bullish' ? 1 : pred.prediction === 'Bearish' ? -1 : 0;
      const actualDirection = actualChange > 0 ? 1 : actualChange < 0 ? -1 : 0;
      pred.accuracy = predictedDirection === actualDirection ? 100 : 0;
      pred.actual_price = actualPrice;
      pred.actual_change = actualChange;
      
      fs.writeFileSync(JSON_STORE_PATH, JSON.stringify(data, null, 2));
    }
  }
  
  static getAccuracyStats(fromDate?: string, toDate?: string): {
    total: number;
    correct: number;
    accuracy: number;
    avgConfidence: number;
  } {
    let predictions: StockPrediction[] = [];
    
    if (db) {
      let query = 'SELECT * FROM predictions WHERE accuracy IS NOT NULL';
      const params: any[] = [];
      
      if (fromDate) {
        query += ' AND target_date >= ?';
        params.push(fromDate);
      }
      if (toDate) {
        query += ' AND target_date <= ?';
        params.push(toDate);
      }
      
      const rows = db.prepare(query).all(...params);
      predictions = rows.map((r: any) => ({ ...r, signals: JSON.parse(r.signals) }));
    } else {
      const data = JSON.parse(fs.readFileSync(JSON_STORE_PATH, 'utf-8')) as StockPrediction[];
      predictions = data.filter(p => {
        if (p.accuracy === undefined) return false;
        if (fromDate && p.target_date < fromDate) return false;
        if (toDate && p.target_date > toDate) return false;
        return true;
      });
    }
    
    const total = predictions.length;
    const correct = predictions.filter(p => p.accuracy === 100).length;
    const avgConfidence = total > 0 
      ? predictions.reduce((sum, p) => sum + p.confidence, 0) / total 
      : 0;
    
    return {
      total,
      correct,
      accuracy: total > 0 ? (correct / total) * 100 : 0,
      avgConfidence,
    };
  }
  
  static getAllDatesWithPredictions(): string[] {
    if (db) {
      const rows = db.prepare('SELECT DISTINCT target_date FROM predictions ORDER BY target_date DESC').all();
      return rows.map((r: any) => r.target_date);
    } else {
      const data = JSON.parse(fs.readFileSync(JSON_STORE_PATH, 'utf-8')) as StockPrediction[];
      const dates = [...new Set(data.map(p => p.target_date))];
      return dates.sort().reverse();
    }
  }
}
