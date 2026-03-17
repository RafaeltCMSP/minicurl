/**
 * MinicUrl AI — Agente Orquestrador (v2)
 * Integra memória persistente e CodeAnalyzerAgent.
 */

import { OllamaClient } from '../ollamaClient.js';
import { configManager } from '../config.js';
import { memoryManager } from '../memory.js';
import { AgentBus, INTENTS as BASE_INTENTS } from '../agentBus.js';
import { RequestAgent } from './requestAgent.js';
import { TestAgent } from './testAgent.js';
import { ExplainAgent } from './explainAgent.js';
import { DebugAgent } from './debugAgent.js';
import { CodeAnalyzerAgent } from './codeAnalyzerAgent.js';

// Estende intents com o novo
export const INTENTS = {
  ...BASE_INTENTS,
  ANALYZE_CODE: 'analyze_code',
};

const SYSTEM_PROMPT = `Você é o MinicUrl AI Assistant — especialista em HTTP, APIs REST, cURL e testes de APIs.

Roda dentro do MinicUrl, uma CLI poderosa para testar requisições HTTP no terminal.

SUAS CAPACIDADES:
- Gerar, executar e analisar requisições HTTP (GET, POST, PUT, PATCH, DELETE)
- Criar suites de testes automatizados para APIs
- Explicar respostas HTTP, status codes, headers e conceitos
- Debugar erros de requisição e sugerir correções
- Analisar pastas de projetos e detectar chamadas de API no código
- Converter entre formatos: cURL, fetch, axios, etc.

REGRAS:
- Responda SEMPRE em português brasileiro
- Seja direto e técnico mas didático
- Quando gerar cURL ou código, use blocos de código formatados
- Ao receber um erro, sempre sugira pelo menos 2 soluções concretas
- Máximo 500 palavras por resposta (seja conciso)
- Lembre sempre das sessões anteriores e APIs descobertas`;

export class Orchestrator {
  constructor() {
    this.bus = new AgentBus();
    this.client = null;
    this.config = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;

    this.config = await configManager.get();
    this.client = new OllamaClient(this.config.ollamaUrl, this.config.apiKey);

    // Carrega memória para contexto
    await memoryManager.load();

    // Instancia agentes
    const requestAgent    = new RequestAgent(this.client, this.bus);
    const testAgent       = new TestAgent(this.client, this.bus);
    const explainAgent    = new ExplainAgent(this.client, this.bus);
    const debugAgent      = new DebugAgent(this.client, this.bus);
    const codeAnalyzer    = new CodeAnalyzerAgent(this.client, this.bus);

    this.bus.on(INTENTS.REQUEST,      (p) => requestAgent.handle(p));
    this.bus.on(INTENTS.TEST,         (p) => testAgent.handle(p));
    this.bus.on(INTENTS.EXPLAIN,      (p) => explainAgent.handle(p));
    this.bus.on(INTENTS.DEBUG,        (p) => debugAgent.handle(p));
    this.bus.on(INTENTS.ANALYZE_CODE, (p) => codeAnalyzer.handle(p));
    this.bus.on(INTENTS.GENERAL,      (p) => this._handleGeneral(p));
    this.bus.on(INTENTS.CONFIG,       (p) => this._handleConfig(p));

    this._initialized = true;
  }

  async checkOllama() {
    if (!this.client) {
      const cfg = await configManager.get();
      this.client = new OllamaClient(cfg.ollamaUrl, cfg.apiKey);
    }
    return this.client.checkConnection();
  }

  // ─────────────────────────────────────────────
  //  CHAT
  // ─────────────────────────────────────────────

  async chat(userMessage, onToken = null) {
    await this.init();
    this.config = await configManager.get();

    this.bus.addUserMessage(userMessage);

    // Detecta intenção — agora inclui analyze_code
    const intent = this._detectIntent(userMessage);

    const payload = {
      userMessage,
      messages: await this._buildMessages(),
      intent,
      onToken,
      model: this.config.model,
      streaming: this.config.streaming && typeof onToken === 'function',
      context: this.bus.getLastContext(),
    };

    let result;
    try {
      result = await this.bus.dispatch(intent, payload);
    } catch (err) {
      result = {
        content: `⚠️ Erro no agente: ${err.message}\n\nVerifique se o Ollama está rodando: \`ollama serve\``,
        agentUsed: 'error-handler',
        stats: {},
      };
    }

    this.bus.addAssistantMessage(result.content);

    // Aprende padrão se foi uma requisição
    if (result.data?.url && intent === INTENTS.REQUEST) {
      await memoryManager.addApiPattern({
        method: result.data.method || 'GET',
        url: result.data.url,
        authType: result.data.headers?.Authorization ? 'bearer' : null,
      }).catch(() => {});
    }

    return {
      content:    result.content,
      intent,
      agentUsed:  result.agentUsed || intent,
      stats:      result.stats || {},
      action:     result.action || null,
      data:       result.data || null,
    };
  }

  clearSession() { this.bus.clearHistory(); }

  getAgentLog() { return this.bus.agentLog; }

  // ─────────────────────────────────────────────
  //  INTERNALS
  // ─────────────────────────────────────────────

  _detectIntent(text) {
    const t = text.toLowerCase();

    // Code Analysis — tem precedência alta
    if (/analise?|analisar|escanea?r|scan|procura?|vasculha?|detecta?|identifica?/.test(t) &&
        /pasta|diret[oó]rio|projeto|c[oó]digo|reposit[oó]rio|src|folder/.test(t)) {
      return INTENTS.ANALYZE_CODE;
    }
    if (/\/analyze/.test(t)) return INTENTS.ANALYZE_CODE;

    if (/erro|error|falhou|falha|porque|problema|debug|bug|n[ãa]o funciona/.test(t)) return INTENTS.DEBUG;
    if (/test|suite|valida|automatiz|spec|assert|cen[áa]rio/.test(t)) return INTENTS.TEST;
    if (/explica|o\s+que\s+[eé]|entend|doc|documenta|descreve|analisa/.test(t)) return INTENTS.EXPLAIN;
    if (/get|post|put|patch|delete|curl|requisi|request|url|endpoint|api|header|bearer|json|body|http/.test(t)) return INTENTS.REQUEST;
    if (/config|modelo|model|ollama|api\s+key/.test(t)) return INTENTS.CONFIG;

    return INTENTS.GENERAL;
  }

  async _buildMessages() {
    const history = this.bus.getHistory();
    const limit = this.config.historyLimit || 50;
    const trimmed = history.slice(-limit);

    // Injeta contexto de memória no system prompt
    let systemContent = SYSTEM_PROMPT;
    try {
      const memCtx = await memoryManager.buildMemoryContext();
      if (memCtx && memCtx !== '[MEMÓRIA DAS SESSÕES ANTERIORES]') {
        systemContent += '\n\n' + memCtx;
      }
    } catch { /* ignora erro de memória */ }

    return [
      { role: 'system', content: systemContent },
      ...trimmed,
    ];
  }

  async _handleGeneral({ messages, model, streaming, onToken }) {
    if (streaming && onToken) {
      const res = await this.client.chatStream(messages, model, onToken);
      return { content: res.content, agentUsed: 'orchestrator', stats: res };
    }
    const res = await this.client.chat(messages, model);
    return { content: res.content, agentUsed: 'orchestrator', stats: res };
  }

  async _handleConfig({ userMessage }) {
    const cfg = await configManager.get();
    return {
      content: [
        '## ⚙️ Configuração atual',
        '',
        `- **URL Ollama:** \`${cfg.ollamaUrl}\``,
        `- **Modelo:** \`${cfg.model}\``,
        `- **API Key:** ${cfg.apiKey ? '`***' + cfg.apiKey.slice(-4) + '`' : '(não definida)'}`,
        `- **Streaming:** ${cfg.streaming ? 'ativo ✅' : 'inativo ❌'}`,
        '',
        '**Altere com os comandos:**',
        '```',
        '/config url http://localhost:11434',
        '/config model mistral',
        '/config key minha-api-key',
        '/config streaming on',
        '```',
      ].join('\n'),
      agentUsed: 'config-agent',
    };
  }
}

export const orchestrator = new Orchestrator();
