/**
 * MinicUrl AI — DebugAgent
 * Especialista em diagnosticar erros de requisição HTTP e sugerir correções.
 * Analisa códigos de erro, headers, body e padrões de falha.
 */

const DEBUG_SYSTEM = `Você é um especialista em debugging de APIs REST e problemas de rede dentro do MinicUrl CLI.

SEU PAPEL:
- Diagnosticar erros de requisição HTTP com precisão
- Identificar causas raízes (CORS, auth, rate limit, payload inválido, etc.)
- Sugerir correções concretas e testáveis
- Detectar padrões comuns de falha em APIs

TABELA DE ERROS MAIS COMUNS — use para seu diagnóstico:

Erros de rede:
- ECONNREFUSED: servidor não está rodando na porta
- ENOTFOUND: DNS não resolvido / URL incorreta
- ETIMEDOUT: servidor demorou demais / firewall bloqueou
- ECONNRESET: conexão foi resetada pelo servidor

Erros HTTP:
- 400: payload inválido, parâmetros faltando ou formato errado
- 401: autenticação necessária (token faltando ou expirado)
- 403: autorização negada (token válido mas sem permissão)
- 404: rota não existe (verifique a URL exata)
- 405: método HTTP não permitido nesta rota
- 408/504: timeout do servidor
- 409: conflito (registro duplicado, estado inválido)
- 422: dados semanticamente inválidos (validação falhou)
- 429: rate limit atingido (aguarde e tente novamente)
- 500: erro interno do servidor (bug no backend)
- 502/503: servidor fora do ar ou em manutenção

FORMATO DE RESPOSTA:
## 🔍 Diagnóstico
[causa raiz identificada]

## 🩺 Análise Detalhada
[o que está acontecendo tecnicamente]

## 🔧 Soluções
1. [solução mais provável com comando concreto]
2. [solução alternativa]
3. [verificação adicional se necessário]

## 🧪 Teste de Verificação
[requisição cURL para confirmar se foi resolvido]

REGRAS:
- Sempre forneça pelo menos 2 soluções práticas
- Se possível, mostre o cURL correto esperado
- Seja específico — evite respostas genéricas
- Responda SEMPRE em português brasileiro`;

export class DebugAgent {
  constructor(ollamaClient, bus) {
    this.client = ollamaClient;
    this.bus = bus;
  }

  async handle({ userMessage, messages, model, streaming, onToken, context }) {
    // Sempre enriquece com contexto de erro/resultado
    const enrichedMessages = this._enrichWithError(messages, context, userMessage);

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

    // Detecta requisição corrigida na resposta
    const fixedMatch = content.match(/\[FIX:\s*(GET|POST|PUT|PATCH|DELETE)\s+(https?:\/\/[^\]]+)\]/i);
    let action = null;
    let data = null;

    if (fixedMatch) {
      action = 'execute_fixed_request';
      data = {
        method: fixedMatch[1].toUpperCase(),
        url: fixedMatch[2].trim(),
      };
    }

    return {
      content,
      agentUsed: 'debug-agent',
      stats,
      action,
      data,
    };
  }

  /**
   * Debug direto de um erro sem contexto de chat
   * (chamado automaticamente após falha de requisição)
   */
  async debugError(error, request, model) {
    const messages = [
      {
        role: 'system',
        content: DEBUG_SYSTEM,
      },
      {
        role: 'user',
        content: this._buildErrorContext(error, request),
      },
    ];

    const res = await this.client.chat(messages, model);
    return res.content;
  }

  // ─────────────────────────────────────────────
  //  INTERNALS
  // ─────────────────────────────────────────────

  _enrichWithError(messages, context, userMessage) {
    const lines = [];

    if (context?.result) {
      const { request, result } = context;
      if (result.status >= 400) {
        lines.push('[ERRO NA ÚLTIMA REQUISIÇÃO]');
        lines.push(`Requisição: ${request.method} ${request.url}`);
        lines.push(`Status: ${result.status} ${result.statusText}`);
        lines.push(`Body: ${JSON.stringify(result.data)?.substring(0, 500)}`);
        lines.push(`Headers enviados: ${JSON.stringify(request.headers)}`);
      }
    }

    if (lines.length === 0) return messages;

    const note = '\n\n' + lines.join('\n');
    const enriched = [...messages];
    if (enriched[0]?.role === 'system') {
      enriched[0] = { ...enriched[0], content: enriched[0].content + note };
    }
    return enriched;
  }

  _buildErrorContext(error, request) {
    return [
      'Preciso de ajuda para debugar este erro:',
      '',
      `Requisição: ${request?.method || 'N/A'} ${request?.url || 'N/A'}`,
      `Headers: ${JSON.stringify(request?.headers || {})}`,
      `Body: ${request?.body ? JSON.stringify(request.body) : '(nenhum)'}`,
      '',
      `Erro: ${error.message}`,
      `Código: ${error.code || 'N/A'}`,
    ].join('\n');
  }
}
