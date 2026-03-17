/**
 * MinicUrl AI — OllamaClient
 * Cliente HTTP nativo para a API Ollama (sem dependências externas)
 * Suporta: chat, generate, list models, streaming de tokens
 */

import http from 'http';
import https from 'https';
import { configManager } from './config.js';

export class OllamaClient {
  /**
   * @param {string} baseUrl  — ex: "http://localhost:11434"
   * @param {string} apiKey   — opcional, para Ollama com auth ou OpenAI-compat
   */
  constructor(baseUrl, apiKey = '') {
    this.baseUrl = baseUrl?.replace(/\/$/, '') || 'http://localhost:11434';
    this.apiKey = apiKey;
  }

  /**
   * Cria instância a partir da config salva
   */
  static async create() {
    const cfg = await configManager.get();
    return new OllamaClient(cfg.ollamaUrl, cfg.apiKey);
  }

  // ─────────────────────────────────────────────
  //  CHECKS
  // ─────────────────────────────────────────────

  /**
   * Verifica se o Ollama está online e acessível
   */
  async checkConnection() {
    try {
      const res = await this._request('GET', '/api/tags', null, 5000);
      return { online: true, models: res.models?.map(m => m.name) || [] };
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  // ─────────────────────────────────────────────
  //  MODELS
  // ─────────────────────────────────────────────

  /**
   * Lista modelos disponíveis localmente no Ollama
   */
  async listModels() {
    const res = await this._request('GET', '/api/tags');
    return (res.models || []).map(m => ({
      name: m.name,
      size: m.size,
      modified: m.modified_at,
      digest: m.digest?.substring(0, 12),
    }));
  }

  // ─────────────────────────────────────────────
  //  CHAT (messages[])
  // ─────────────────────────────────────────────

  /**
   * Envia lista de mensagens e retorna resposta completa
   * @param {Array} messages   — [{role, content}]
   * @param {string} model
   * @param {object} options   — { temperature, max_tokens }
   */
  async chat(messages, model, options = {}) {
    const body = {
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
      },
    };

    const res = await this._request('POST', '/api/chat', body);
    return {
      content: res.message?.content || res.response || '',
      model: res.model,
      promptTokens: res.prompt_eval_count ?? 0,
      responseTokens: res.eval_count ?? 0,
      durationMs: res.eval_duration ? Math.round(res.eval_duration / 1e6) : 0,
    };
  }

  /**
   * Envia mensagens com streaming — chama onToken(token) a cada chunk
   * @param {Array} messages
   * @param {string} model
   * @param {Function} onToken   — callback(string)
   * @param {object} options
   */
  async chatStream(messages, model, onToken, options = {}) {
    const body = {
      model,
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
      },
    };

    let fullContent = '';
    let finalStats = {};

    await this._requestStream('POST', '/api/chat', body, (line) => {
      try {
        const parsed = JSON.parse(line);
        const token = parsed.message?.content || '';
        if (token) {
          fullContent += token;
          onToken(token);
        }
        if (parsed.done) {
          finalStats = {
            model: parsed.model,
            promptTokens: parsed.prompt_eval_count ?? 0,
            responseTokens: parsed.eval_count ?? 0,
            durationMs: parsed.eval_duration ? Math.round(parsed.eval_duration / 1e6) : 0,
          };
        }
      } catch {
        // ignora linhas não-JSON (keep-alive etc.)
      }
    });

    return { content: fullContent, ...finalStats };
  }

  // ─────────────────────────────────────────────
  //  GENERATE (prompt simples)
  // ─────────────────────────────────────────────

  /**
   * Geração simples a partir de prompt (sem histórico)
   */
  async generate(prompt, model, options = {}) {
    const body = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 1024,
      },
    };
    const res = await this._request('POST', '/api/generate', body);
    return {
      content: res.response || '',
      model: res.model,
      promptTokens: res.prompt_eval_count ?? 0,
      responseTokens: res.eval_count ?? 0,
    };
  }

  /**
   * Geração com streaming
   */
  async generateStream(prompt, model, onToken, options = {}) {
    const body = {
      model,
      prompt,
      stream: true,
      options: { temperature: options.temperature ?? 0.7, num_predict: options.maxTokens ?? 1024 },
    };

    let fullContent = '';
    await this._requestStream('POST', '/api/generate', body, (line) => {
      try {
        const parsed = JSON.parse(line);
        const token = parsed.response || '';
        if (token) { fullContent += token; onToken(token); }
      } catch { /* ignorar */ }
    });
    return { content: fullContent, model };
  }

  // ─────────────────────────────────────────────
  //  HTTP INTERNALS
  // ─────────────────────────────────────────────

  _buildRequestOptions(method, pathname, body) {
    const parsed = new URL(this.baseUrl + pathname);
    const isHttps = parsed.protocol === 'https:';
    const bodyStr = body ? JSON.stringify(body) : null;

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'MinicUrl-AI/1.0',
      'Accept': 'application/json',
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    return {
      isHttps,
      bodyStr,
      opts: {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
      },
    };
  }

  /**
   * Requisição HTTP simples — retorna objeto JSON
   */
  _request(method, pathname, body = null, timeout = 60000) {
    const { isHttps, bodyStr, opts } = this._buildRequestOptions(method, pathname, body);
    const lib = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const req = lib.request({ ...opts, timeout }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf8');
            // Pode ter múltiplas linhas JSON (streaming acidental) — pegar última
            const lines = text.trim().split('\n').filter(Boolean);
            const json = JSON.parse(lines[lines.length - 1]);
            resolve(json);
          } catch (e) {
            reject(new Error(`Resposta inválida do Ollama: ${e.message}`));
          }
        });
        res.on('error', reject);
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout ao conectar ao Ollama')); });
      req.on('error', (e) => {
        if (e.code === 'ECONNREFUSED') {
          reject(new Error(`Ollama não está rodando em ${this.baseUrl}. Execute: ollama serve`));
        } else if (e.code === 'ENOTFOUND') {
          reject(new Error(`Host não encontrado: ${this.baseUrl}`));
        } else {
          reject(e);
        }
      });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Requisição HTTP com streaming — chama onLine(string) para cada linha JSON
   */
  _requestStream(method, pathname, body, onLine, timeout = 120000) {
    const { isHttps, bodyStr, opts } = this._buildRequestOptions(method, pathname, body);
    const lib = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const req = lib.request({ ...opts, timeout }, (res) => {
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop(); // última linha pode estar incompleta
          for (const line of lines) {
            if (line.trim()) onLine(line.trim());
          }
        });

        res.on('end', () => {
          if (buffer.trim()) onLine(buffer.trim());
          resolve();
        });

        res.on('error', reject);
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('Streaming timeout')); });
      req.on('error', (e) => {
        if (e.code === 'ECONNREFUSED') {
          reject(new Error(`Ollama não está rodando em ${this.baseUrl}. Execute: ollama serve`));
        } else {
          reject(e);
        }
      });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}
