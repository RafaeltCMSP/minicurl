/**
 * MinicUrl History Manager - Persistência de histórico
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const HISTORY_DIR = path.join(os.homedir(), '.minicurl');
const HISTORY_FILE = path.join(HISTORY_DIR, 'history.json');
const MAX_ENTRIES = 500;

export class HistoryManager {
  constructor() {
    this._ensureDir();
  }

  async _ensureDir() {
    try {
      await fs.mkdir(HISTORY_DIR, { recursive: true });
    } catch {}
  }

  async getAll() {
    try {
      const raw = await fs.readFile(HISTORY_FILE, 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async add(entry) {
    const entries = await this.getAll();
    entries.push({
      ...entry,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
    });

    // Limita tamanho
    const trimmed = entries.slice(-MAX_ENTRIES);
    await fs.writeFile(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  }

  async clear() {
    await fs.writeFile(HISTORY_FILE, '[]', 'utf8');
  }

  async search(query) {
    const entries = await this.getAll();
    return entries.filter(e =>
      e.url?.includes(query) ||
      e.method?.includes(query.toUpperCase())
    );
  }

  async exportToFile(filename) {
    const entries = await this.getAll();
    await fs.writeFile(filename, JSON.stringify(entries, null, 2), 'utf8');
  }
}
