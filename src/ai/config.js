/**
 * MinicUrl AI — ConfigManager
 * Persiste configuração do Ollama em ~/.minicurl-ai.json
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_FILE = path.join(os.homedir(), '.minicurl-ai.json');

const DEFAULTS = {
  ollamaUrl: 'http://localhost:11434',
  model: 'llama3',
  apiKey: '',
  streaming: true,
  maxTokens: 2048,
  temperature: 0.7,
  systemContext: true,
  historyLimit: 50,
  requestAgentEnabled: true,
  testAgentEnabled: true,
  explainAgentEnabled: true,
  debugAgentEnabled: true,
};

export class ConfigManager {
  constructor() {
    this._config = null;
  }

  /**
   * Carrega config do disco (ou usa defaults)
   */
  async load() {
    try {
      const raw = await fs.readFile(CONFIG_FILE, 'utf8');
      this._config = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      this._config = { ...DEFAULTS };
    }
    return this._config;
  }

  /**
   * Retorna configuração atual (carrega se necessário)
   */
  async get(key = null) {
    if (!this._config) await this.load();
    if (key) return this._config[key];
    return { ...this._config };
  }

  /**
   * Define um ou mais valores e persiste
   */
  async set(updates) {
    if (!this._config) await this.load();
    const prev = { ...this._config };
    this._config = { ...this._config, ...updates };
    await this._save();
    return { prev, current: { ...this._config } };
  }

  /**
   * Reseta para defaults
   */
  async reset() {
    this._config = { ...DEFAULTS };
    await this._save();
    return this._config;
  }

  /**
   * Persiste no arquivo
   */
  async _save() {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(this._config, null, 2), 'utf8');
  }

  /**
   * Retorna localização do arquivo de config
   */
  getConfigPath() {
    return CONFIG_FILE;
  }

  /**
   * Valida a configuração atual
   */
  async validate() {
    const cfg = await this.get();
    const errors = [];

    try {
      new URL(cfg.ollamaUrl);
    } catch {
      errors.push(`URL inválida: "${cfg.ollamaUrl}"`);
    }

    if (!cfg.model || cfg.model.trim() === '') {
      errors.push('Modelo não definido. Use: minicurl ai config --model <nome>');
    }

    return { valid: errors.length === 0, errors };
  }
}

// Singleton global
export const configManager = new ConfigManager();
