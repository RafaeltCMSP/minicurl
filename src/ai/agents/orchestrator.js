/**
 * MinicUrl AI — Agente Orquestrador
 * É o único ponto de contato com o usuário.
 * Detecta intenção, roteia para o agente especialista e entrega a resposta.
 */

import { OllamaClient } from '../ollamaClient.js';
import { configManager } from '../config.js';
import { AgentBus, INTENTS } from '../agentBus.js';
import { RequestAgent } from './requestAgent.js';
import { TestAgent } from './testAgent.js';
import { ExplainAgent } from './explainAgent.js';
import { DebugAgent } from './debugAgent.js';

const SYSTEM_PROMPT = `Você é o MinicUrl AI Assistant, um agente especialista em HTTP, APIs REST, cURL e testes de APIs.

Você roda dentro do MinicUrl — uma CLI poderosa para testar requisições HTTP no terminal.

SUAS CAPACIDADES:
- Gerar, executar e analisar requisições HTTP (GET, POST, PUT, PATCH, DELETE)
- Criar suites de testes automatizados para APIs
- Explicar respostas HTTP, status codes, headers e conceitos
- Debugar erros de requisição e sugerir correções
- Converter entre formatos: cURL, fetch, axios, etc.

REGRAS IMPORTANTES:
- Responda SEMPRE em português brasileiro
- Seja direto e técnico mas didático
- Quando gerar cURL ou código, use blocos de código formatados
- Ao receber um erro, sempre sugira pelo menos 2 soluções concretas
- Contexto da sessão: lembre das requisições anteriores desta conversa

FORMATO DE RESPOSTA:
- Use markdown simples (funciona bem no terminal)
- Prefira listas quando listar múltiplos itens
- Para cURLs/código: use \`\`\`bash ou \`\`\`json
- Máximo 500 palavras por resposta (seja conciso)`;

export class Orchestrator {
  constructor() {
    this.bus = new AgentBus();
    this.client = null;
    this.config = null;
    this._initialized = false;
  }

  /**
   * Inicializa o orquestrador e todos os agentes
   */
  async init() {
    if (this._initialized) return;

    this.config = await configManager.get();
    this.client = new OllamaClient(this.config.ollamaUrl, this.config.apiKey);

    // Instancia agentes especializados
    const requestAgent = new RequestAgent(this.client, this.bus);
    const testAgent = new TestAgent(this.client, this.bus);
    const explainAgent = new ExplainAgent(this.client, this.bus);
    const debugAgent = new DebugAgent(this.client, this.bus);

    // Registra handlers no barramento
    this.bus.on(INTENTS.REQUEST, (payload) => requestAgent.handle(payload));
    this.bus.on(INTENTS.TEST, (payload) => testAgent.handle(payload));
    this.bus.on(INTENTS.EXPLAIN, (payload) => explainAgent.handle(payload));
    this.bus.on(INTENTS.DEBUG, (payload) => debugAgent.handle(payload));
    this.bus.on(INTENTS.GENERAL, (payload) => this._handleGeneral(payload));
    this.bus.on(INTENTS.CONFIG, (payload) => this._handleConfig(payload));

    this._initialized = true;
  }

  /**
   * Verifica se o Ollama está disponível
   */
  async checkOllama() {
    if (!this.client) {
      const cfg = await configManager.get();
      this.client = new OllamaClient(cfg.ollamaUrl, cfg.apiKey);
    }
    return this.client.checkConnection();
  }

  // ─────────────────────────────────────────────
  //  CHAT — ponto de entrada principal
  // ─────────────────────────────────────────────

  /**
   * Processa uma mensagem do usuário e retorna a resposta
   * @param {string} userMessage
   * @param {Function|null} onToken   — callback para streaming (opcional)
   * @returns {Promise<{content, intent, agentUsed, stats}>}
   */
  async chat(userMessage, onToken = null) {
    await this.init();

    // Reload config (pode ter mudado)
    this.config = await configManager.get();

    // Adiciona ao histórico
    this.bus.addUserMessage(userMessage);

    // Detecta intenção
    const intent = this.bus.detectIntent(userMessage);

    // Monta payload para o agente
    const payload = {
      userMessage,
      messages: this._buildMessages(),
      intent,
      onToken,
      model: this.config.model,
      streaming: this.config.streaming && typeof onToken === 'function',
      context: this.bus.getLastContext(),
    };

    let result;
    try {
      // Despacha para o agente correto
      result = await this.bus.dispatch(intent, payload);
    } catch (err) {
      result = {
        content: `⚠️ Erro no agente: ${err.message}\n\nVerifique se o Ollama está rodando: \`ollama serve\``,
        agentUsed: 'error-handler',
        stats: {},
      };
    }

    // Adiciona resposta ao histórico
    this.bus.addAssistantMessage(result.content);

    return {
      content: result.content,
      intent,
      agentUsed: result.agentUsed || intent,
      stats: result.stats || {},
      action: result.action || null,   // ação especial (ex: executar request)
      data: result.data || null,       // dados adicionais
    };
  }

  /**
   * Limpa histórico da sessão atual
   */
  clearSession() {
    this.bus.clearHistory();
  }

  /**
   * Retorna log de agentes ativados nesta sessão
   */
  getAgentLog() {
    return this.bus.agentLog;
  }

  // ─────────────────────────────────────────────
  //  INTERNALS
  // ─────────────────────────────────────────────

  /**
   * Monta o array de messages com system prompt
   */
  _buildMessages() {
    const history = this.bus.getHistory();
    // Limita histórico para não explodir o contexto
    const limit = this.config.historyLimit || 50;
    const trimmed = history.slice(-limit);

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      ...trimmed,
    ];
  }

  /**
   * Handler para intenção GENERAL — resposta direta do orquestrador
   */
  async _handleGeneral({ messages, userMessage, model, streaming, onToken }) {
    if (streaming && onToken) {
      const res = await this.client.chatStream(messages, model, onToken);
      return { content: res.content, agentUsed: 'orchestrator', stats: res };
    } else {
      const res = await this.client.chat(messages, model);
      return { content: res.content, agentUsed: 'orchestrator', stats: res };
    }
  }

  /**
   * Handler para intenção CONFIG — mostra/orienta sobre configuração
   */
  async _handleConfig({ userMessage }) {
    const cfg = await configManager.get();
    const content = [
      '⚙️  **Configuração atual do MinicUrl AI:**',
      '',
      `  🔗 URL Ollama: \`${cfg.ollamaUrl}\``,
      `  🤖 Modelo: \`${cfg.model}\``,
      `  🔑 API Key: ${cfg.apiKey ? '`***' + cfg.apiKey.slice(-4) + '`' : '`(não definida)`'}`,
      `  📡 Streaming: ${cfg.streaming ? '✅ ativo' : '❌ desativo'}`,
      `  🌡️  Temperatura: ${cfg.temperature}`,
      '',
      '**Para alterar, use os comandos no chat:**',
      '  `/config url http://localhost:11434`',
      '  `/config model mistral`',
      '  `/config key minha-api-key`',
      '  `/config streaming on|off`',
      '',
      'Ou via CLI:',
      '  `minicurl ai config --url http://... --model llama3`',
    ].join('\n');

    return { content, agentUsed: 'config-agent' };
  }
}

// Singleton global para a sessão
export const orchestrator = new Orchestrator();
