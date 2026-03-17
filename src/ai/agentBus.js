/**
 * MinicUrl AI — AgentBus
 * Barramento central de mensagens entre agentes.
 * Gerencia contexto compartilhado, roteamento de intenção e histórico.
 */

export const INTENTS = {
  REQUEST: 'request',       // Gerar/executar requisições HTTP
  TEST: 'test',             // Criar/executar suites de teste
  EXPLAIN: 'explain',       // Explicar resposta HTTP ou conceito
  DEBUG: 'debug',           // Analisar erros e sugerir correções
  CONFIG: 'config',         // Configurar a ferramenta
  GENERAL: 'general',       // Conversa geral / dúvidas
};

export class AgentBus {
  constructor() {
    /** Histórico de mensagens do chat atual */
    this.conversationHistory = [];

    /** Último resultado de requisição HTTP (contexto entre agentes) */
    this.lastResult = null;

    /** Última requisição executada */
    this.lastRequest = null;

    /** Handlers registrados por intenção */
    this._handlers = new Map();

    /** Log de ativações de agentes nesta sessão */
    this.agentLog = [];
  }

  // ─────────────────────────────────────────────
  //  Registro de agentes
  // ─────────────────────────────────────────────

  /**
   * Registra um handler para uma intenção específica
   * @param {string} intent  — valor de INTENTS
   * @param {Function} fn    — async fn(payload) => result
   */
  on(intent, fn) {
    this._handlers.set(intent, fn);
  }

  // ─────────────────────────────────────────────
  //  Roteamento
  // ─────────────────────────────────────────────

  /**
   * Detecta intenção a partir de texto livre do usuário
   * (heurística local — sem chamar a IA para classificar)
   * @param {string} text
   * @returns {string}  — um valor de INTENTS
   */
  detectIntent(text) {
    const t = text.toLowerCase();

    // Debug / erros
    if (/erro|error|falhou|falha|por que|porque|problema|não funciona|nao funciona|debug|issue|bug/.test(t)) {
      return INTENTS.DEBUG;
    }

    // Testes
    if (/test|suite|caso|casos|valida|validar|automatiz|spec|assert|cenário/.test(t)) {
      return INTENTS.TEST;
    }

    // Explicação
    if (/explica|explain|o que é|o que significa|entend|doc|documenta|descreve|resume|resumo|analis/.test(t)) {
      return INTENTS.EXPLAIN;
    }

    // Requisição HTTP
    if (/get|post|put|patch|delete|curl|requisição|request|url|endpoint|api|header|bearer|auth|json|body|payload|http|https/.test(t)) {
      return INTENTS.REQUEST;
    }

    // Config
    if (/config|configura|modelo|model|url do ollama|api key|apikey|ajust/.test(t)) {
      return INTENTS.CONFIG;
    }

    return INTENTS.GENERAL;
  }

  /**
   * Despacha uma mensagem para o agente correto
   * @param {string} intent
   * @param {object} payload  — { userMessage, messages, ...extras }
   * @returns {Promise<*>}
   */
  async dispatch(intent, payload) {
    const handler = this._handlers.get(intent) || this._handlers.get(INTENTS.GENERAL);
    if (!handler) throw new Error(`Nenhum agente registrado para: ${intent}`);

    this.agentLog.push({
      intent,
      ts: new Date().toISOString(),
      preview: payload.userMessage?.substring(0, 80),
    });

    return handler(payload);
  }

  // ─────────────────────────────────────────────
  //  Histórico de conversa
  // ─────────────────────────────────────────────

  addUserMessage(content) {
    this.conversationHistory.push({ role: 'user', content });
  }

  addAssistantMessage(content) {
    this.conversationHistory.push({ role: 'assistant', content });
  }

  getHistory() {
    return [...this.conversationHistory];
  }

  clearHistory() {
    this.conversationHistory = [];
    this.lastResult = null;
    this.lastRequest = null;
    this.agentLog = [];
  }

  // ─────────────────────────────────────────────
  //  Contexto compartilhado
  // ─────────────────────────────────────────────

  setLastResult(request, result) {
    this.lastRequest = request;
    this.lastResult = result;
  }

  getLastContext() {
    return { request: this.lastRequest, result: this.lastResult };
  }
}
