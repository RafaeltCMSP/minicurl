/**
 * MinicUrl AI — MemoryManager
 * Memória persistente entre sessões.
 *
 * Armazena em ~/.minicurl-memory.json:
 *  - Resumos de conversas passadas
 *  - Padrões de API aprendidos (endpoints, headers recorrentes)
 *  - Preferências do usuário detectadas
 *  - Erros e soluções aprendidas
 *  - Contexto de projetos analisados
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const MEMORY_FILE = path.join(os.homedir(), '.minicurl-memory.json');
const MAX_SESSIONS = 20;         // sessões salvas
const MAX_PATTERNS = 100;        // padrões de API
const MAX_LEARNINGS = 50;        // aprendizados salvos

const DEFAULT_MEMORY = {
  version: 1,
  createdAt: null,
  updatedAt: null,
  sessions: [],          // resumos de sessões passadas
  apiPatterns: [],       // endpoints/APIs descobertos
  learnings: [],         // soluções de erros, dicas
  userPreferences: {},   // preferências detectadas
  projects: {},          // análises de pastas/projetos
  stats: {
    totalSessions: 0,
    totalMessages: 0,
    totalRequestsMade: 0,
    totalTestsGenerated: 0,
    totalApiPatternsFound: 0,
  },
};

export class MemoryManager {
  constructor() {
    this._memory = null;
  }

  // ─────────────────────────────────────────────
  //  LOAD / SAVE
  // ─────────────────────────────────────────────

  async load() {
    try {
      const raw = await fs.readFile(MEMORY_FILE, 'utf8');
      this._memory = { ...DEFAULT_MEMORY, ...JSON.parse(raw) };
    } catch {
      this._memory = {
        ...DEFAULT_MEMORY,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return this._memory;
  }

  async save() {
    if (!this._memory) return;
    this._memory.updatedAt = new Date().toISOString();
    await fs.writeFile(MEMORY_FILE, JSON.stringify(this._memory, null, 2), 'utf8');
  }

  async get() {
    if (!this._memory) await this.load();
    return this._memory;
  }

  getMemoryPath() {
    return MEMORY_FILE;
  }

  // ─────────────────────────────────────────────
  //  SESSÕES
  // ─────────────────────────────────────────────

  /**
   * Salva um resumo da sessão atual ao encerrar
   * @param {Array} messages          — histórico de mensagens [{role, content}]
   * @param {object} sessionStats     — { requests, testsGenerated, duration }
   */
  async saveSession(messages, sessionStats = {}) {
    await this.get();

    // Gera resumo breve (sem IA — apenas primeiros/últimos tópicos)
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content.substring(0, 120));
    const summary = userMessages.slice(0, 3).join(' | ');

    const session = {
      id: Date.now().toString(36),
      date: new Date().toISOString(),
      summary: summary || '(sem mensagens)',
      messageCount: messages.length,
      stats: sessionStats,
    };

    this._memory.sessions.unshift(session);
    if (this._memory.sessions.length > MAX_SESSIONS) {
      this._memory.sessions = this._memory.sessions.slice(0, MAX_SESSIONS);
    }

    this._memory.stats.totalSessions++;
    this._memory.stats.totalMessages += messages.length;
    if (sessionStats.requests) this._memory.stats.totalRequestsMade += sessionStats.requests;
    if (sessionStats.testsGenerated) this._memory.stats.totalTestsGenerated += sessionStats.testsGenerated;

    await this.save();
  }

  // ─────────────────────────────────────────────
  //  PADRÕES DE API
  // ─────────────────────────────────────────────

  /**
   * Registra um padrão de API encontrado (endpoint, método, auth)
   */
  async addApiPattern(pattern) {
    await this.get();

    // Evita duplicatas por URL base
    const baseKey = `${pattern.method}:${pattern.url?.replace(/\/\d+/g, '/:id')}`;
    const exists = this._memory.apiPatterns.find(p => p.key === baseKey);
    if (exists) {
      exists.count = (exists.count || 1) + 1;
      exists.lastSeen = new Date().toISOString();
    } else {
      this._memory.apiPatterns.unshift({
        key: baseKey,
        ...pattern,
        count: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
      if (this._memory.apiPatterns.length > MAX_PATTERNS) {
        this._memory.apiPatterns = this._memory.apiPatterns.slice(0, MAX_PATTERNS);
      }
      this._memory.stats.totalApiPatternsFound++;
    }

    await this.save();
  }

  /**
   * Retorna padrões de API relevantes para um contexto
   */
  async getRelevantPatterns(context = '') {
    await this.get();
    const ctx = context.toLowerCase();
    return this._memory.apiPatterns
      .filter(p => !ctx || p.url?.toLowerCase().includes(ctx) || p.key?.toLowerCase().includes(ctx))
      .slice(0, 10);
  }

  // ─────────────────────────────────────────────
  //  APRENDIZADOS
  // ─────────────────────────────────────────────

  /**
   * Registra uma solução ou aprendizado (ex: erro + solução)
   */
  async addLearning(learning) {
    await this.get();
    this._memory.learnings.unshift({
      id: Date.now().toString(36),
      date: new Date().toISOString(),
      ...learning,
    });
    if (this._memory.learnings.length > MAX_LEARNINGS) {
      this._memory.learnings = this._memory.learnings.slice(0, MAX_LEARNINGS);
    }
    await this.save();
  }

  // ─────────────────────────────────────────────
  //  PROJETOS ANALISADOS
  // ─────────────────────────────────────────────

  /**
   * Salva resultado de análise de um projeto/pasta
   */
  async saveProjectAnalysis(folderPath, analysis) {
    await this.get();
    const key = folderPath.replace(/[\\/:]/g, '_');
    this._memory.projects[key] = {
      path: folderPath,
      analyzedAt: new Date().toISOString(),
      ...analysis,
    };
    await this.save();
  }

  /**
   * Retorna análise prévia de um projeto
   */
  async getProjectAnalysis(folderPath) {
    await this.get();
    const key = folderPath.replace(/[\\/:]/g, '_');
    return this._memory.projects[key] || null;
  }

  // ─────────────────────────────────────────────
  //  PREFERÊNCIAS
  // ─────────────────────────────────────────────

  async setPreference(key, value) {
    await this.get();
    this._memory.userPreferences[key] = value;
    await this.save();
  }

  async getPreference(key, defaultVal = null) {
    await this.get();
    return this._memory.userPreferences[key] ?? defaultVal;
  }

  // ─────────────────────────────────────────────
  //  CONTEXT PARA SYSTEM PROMPT
  // ─────────────────────────────────────────────

  /**
   * Gera um bloco de contexto de memória para injetar no system prompt
   */
  async buildMemoryContext() {
    await this.get();
    const mem = this._memory;

    const lines = ['[MEMÓRIA DAS SESSÕES ANTERIORES]'];

    // Sessões recentes
    if (mem.sessions.length > 0) {
      lines.push('\nSessões recentes:');
      mem.sessions.slice(0, 5).forEach((s, i) => {
        const date = new Date(s.date).toLocaleDateString('pt-BR');
        lines.push(`  ${i + 1}. [${date}] ${s.summary}`);
      });
    }

    // Padrões de API conhecidos
    const topPatterns = mem.apiPatterns.slice(0, 8);
    if (topPatterns.length > 0) {
      lines.push('\nAPIs conhecidas (mais usadas):');
      topPatterns.forEach(p => {
        lines.push(`  · ${p.key} (usado ${p.count}x)`);
      });
    }

    // Estatísticas
    lines.push('\nEstatísticas do usuário:');
    lines.push(`  · ${mem.stats.totalSessions} sessões, ${mem.stats.totalMessages} mensagens`);
    lines.push(`  · ${mem.stats.totalRequestsMade} requisições feitas`);
    lines.push(`  · ${mem.stats.totalTestsGenerated} suites de teste geradas`);

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────
  //  DISPLAY
  // ─────────────────────────────────────────────

  async getSummary() {
    await this.get();
    return {
      sessions: this._memory.sessions.length,
      patterns: this._memory.apiPatterns.length,
      learnings: this._memory.learnings.length,
      projects: Object.keys(this._memory.projects).length,
      stats: this._memory.stats,
      updatedAt: this._memory.updatedAt,
      path: MEMORY_FILE,
    };
  }

  async reset() {
    this._memory = {
      ...DEFAULT_MEMORY,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.save();
  }
}

export const memoryManager = new MemoryManager();
