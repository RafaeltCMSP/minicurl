/**
 * MinicUrl AI — ExplainAgent
 * Especialista em explicar respostas HTTP, status codes, headers e conceitos.
 * Modo "academy": transforma resultados técnicos em aprendizado.
 */

const EXPLAIN_SYSTEM = `Você é um especialista em educação sobre HTTP, APIs REST e desenvolvimento web dentro do MinicUrl CLI.

SEU PAPEL:
- Explicar respostas HTTP de forma didática e clara
- Documentar APIs e endpoints automaticamente
- Ensinar conceitos HTTP relacionados ao contexto
- Transformar resultados técnicos em aprendizado prático

QUANDO EXPLICAR UMA RESPOSTA HTTP, estruture assim:

## 📊 Status Code
- O que significa este código e por que foi retornado

## 📋 Headers Relevantes
- Explique os headers mais importantes da resposta

## 📦 Body / Dados
- O que cada campo significa
- Estrutura dos dados retornados

## ⚡ Performance
- Análise do tempo de resposta
- Se é bom, médio ou ruim

## 💡 Lição do Dia
- Um conceito HTTP relacionado a esta resposta

REGRAS:
- Use emojis moderadamente para facilitar a leitura no terminal
- Seja didático mas não superficial
- Conecte teoria com prática
- Responda SEMPRE em português brasileiro`;

export class ExplainAgent {
  constructor(ollamaClient, bus) {
    this.client = ollamaClient;
    this.bus = bus;
  }

  async handle({ userMessage, messages, model, streaming, onToken, context }) {
    // Sempre enriquece com o contexto da última requisição
    const enrichedMessages = this._enrichWithResult(messages, context);

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

    return {
      content,
      agentUsed: 'explain-agent',
      stats,
    };
  }

  /**
   * Explica diretamente um resultado HTTP sem precisar de conversa
   * (usado pelo fluxo de nova requisição no TUI)
   */
  async explainResult(result, request, model) {
    const messages = [
      {
        role: 'system',
        content: EXPLAIN_SYSTEM,
      },
      {
        role: 'user',
        content: this._buildResultContext(result, request),
      },
    ];

    const res = await this.client.chat(messages, model);
    return res.content;
  }

  // ─────────────────────────────────────────────
  //  INTERNALS
  // ─────────────────────────────────────────────

  _enrichWithResult(messages, context) {
    if (!context?.result) return messages;

    const { request, result } = context;
    const note = '\n\n' + this._buildResultContext(result, request);
    const enriched = [...messages];
    if (enriched[0]?.role === 'system') {
      enriched[0] = { ...enriched[0], content: enriched[0].content + note };
    }
    return enriched;
  }

  _buildResultContext(result, request) {
    const lines = [
      '[DADOS DA ÚLTIMA REQUISIÇÃO PARA EXPLICAR]',
      `Método: ${request?.method || 'N/A'} | URL: ${request?.url || 'N/A'}`,
      `Status: ${result.status} ${result.statusText}`,
      `Tempo: ${result.duration}ms | Tamanho: ${result.size} bytes`,
      '',
      'Headers da resposta:',
      JSON.stringify(result.headers, null, 2),
      '',
      'Body da resposta (primeiros 1000 chars):',
      JSON.stringify(result.data)?.substring(0, 1000) || '(vazio)',
    ];
    return lines.join('\n');
  }
}
