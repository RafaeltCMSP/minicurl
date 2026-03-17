/**
 * MinicUrl AI — RequestAgent
 * Especialista em gerar, executar e analisar requisições HTTP.
 * Usando linguagem natural → cURL → execução → análise.
 */

import { RequestEngine } from '../../core/engine.js';

const REQUEST_SYSTEM = `Você é um especialista em requisições HTTP e cURL dentro do MinicUrl CLI.

SEU PAPEL:
- Gerar requisições HTTP a partir de descrições em linguagem natural
- Analisar e explicar requisições existentes
- Converter entre formatos (cURL, fetch, axios, httpie)
- Identificar problemas em requisições e sugerir correções

FORMATO DE SAÍDA — quando gerar uma requisição, sempre inclua:
1. O comando cURL formatado em bloco de código \`\`\`bash
2. Breve explicação do que faz
3. (Opcional) Variantes ou alternativas

REGRAS:
- Sempre use https quando possível
- Inclua Content-Type quando há body
- Para autenticação Bearer, use: -H "Authorization: Bearer TOKEN"
- Se o usuário pedir para executar, adicione ao final: [EXECUTAR: método url]
- Responda SEMPRE em português brasileiro`;

export class RequestAgent {
  constructor(ollamaClient, bus) {
    this.client = ollamaClient;
    this.bus = bus;
    this.engine = new RequestEngine();
  }

  async handle({ userMessage, messages, model, streaming, onToken, context }) {
    // Enriquece contexto com última requisição se existir
    const enrichedMessages = this._enrichMessages(messages, context);

    let content;
    let stats = {};

    if (streaming && onToken) {
      const res = await this.client.chatStream(enrichedMessages, model, onToken);
      content = res.content;
      stats = res;
    } else {
      const res = await this.client.chat(enrichedMessages, model);
      content = res.content;
      stats = res;
    }

    // Detecta se a resposta contém instrução de execução
    const execMatch = content.match(/\[EXECUTAR:\s*(GET|POST|PUT|PATCH|DELETE|HEAD)\s+(https?:\/\/[^\]]+)\]/i);
    let action = null;
    let data = null;

    if (execMatch) {
      action = 'execute_request';
      data = {
        method: execMatch[1].toUpperCase(),
        url: execMatch[2].trim(),
      };
      // Extrai headers e body do cURL na resposta
      const parsed = this._parseCurlFromContent(content);
      if (parsed) {
        data = { ...data, ...parsed };
      }
    }

    return {
      content,
      agentUsed: 'request-agent',
      stats,
      action,
      data,
    };
  }

  /**
   * Executa uma requisição HTTP diretamente
   */
  async executeRequest({ method, url, headers = {}, body = null, timeout = 30000 }) {
    const result = await this.engine.request({ method, url, headers, body, timeout });
    this.bus.setLastResult({ method, url, headers, body }, result);
    return result;
  }

  /**
   * Gera cURL equivalente
   */
  toCurl(req) {
    return this.engine.toCurl(req);
  }

  // ─────────────────────────────────────────────
  //  INTERNALS
  // ─────────────────────────────────────────────

  _enrichMessages(messages, context) {
    if (!context?.result) return messages;

    const { request, result } = context;
    const contextNote = [
      '',
      `[CONTEXTO DA SESSÃO]`,
      `Última requisição: ${request.method} ${request.url}`,
      `Status: ${result.status} | Tempo: ${result.duration}ms | Tamanho: ${result.size} bytes`,
      `Body (preview): ${JSON.stringify(result.data)?.substring(0, 200)}`,
    ].join('\n');

    // Injeta como nota no system prompt
    const enriched = [...messages];
    if (enriched[0]?.role === 'system') {
      enriched[0] = { ...enriched[0], content: enriched[0].content + '\n' + contextNote };
    }
    return enriched;
  }

  _parseCurlFromContent(content) {
    // Tenta extrair headers e body do bloco cURL na resposta
    const curlBlock = content.match(/```(?:bash|sh)?\n(curl[^`]+)```/i)?.[1] || '';
    const headers = {};
    let body = null;

    const hMatches = curlBlock.matchAll(/-H\s+['"]([^'"]+)['"]/g);
    for (const m of hMatches) {
      const [k, ...rest] = m[1].split(':');
      if (k && rest.length) headers[k.trim()] = rest.join(':').trim();
    }

    const dMatch = curlBlock.match(/-d\s+['"]({[^'"]+})['"]/);
    if (dMatch) {
      try { body = JSON.parse(dMatch[1]); } catch { body = dMatch[1]; }
    }

    return { headers, body };
  }
}
