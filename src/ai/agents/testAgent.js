/**
 * MinicUrl AI — TestAgent
 * Especialista em criar e executar suites de testes para APIs.
 * Gera JSON compatível com o TestRunner do MinicUrl.
 */

import fs from 'fs/promises';
import { TestRunner } from '../../core/testRunner.js';

const TEST_SYSTEM = `Você é um especialista em testes de APIs REST dentro do MinicUrl CLI.

SEU PAPEL:
- Criar suites de teste automatizadas no formato JSON do MinicUrl
- Analisar APIs e gerar casos de teste completos
- Incluir casos de sucesso, erro, edge cases e validações

FORMATO DE SUITE DE TESTE MinicUrl (sempre que gerar uma suite, use este JSON):
\`\`\`json
{
  "name": "Nome da Suite",
  "baseUrl": "https://api.exemplo.com",
  "headers": {
    "Content-Type": "application/json"
  },
  "tests": [
    {
      "name": "Descrição do teste",
      "method": "GET",
      "path": "/endpoint",
      "expectedStatus": 200,
      "body": null,
      "assertions": [
        { "field": "$.campo", "operator": "exists" },
        { "field": "$.status", "operator": "equals", "value": "ok" }
      ]
    }
  ]
}
\`\`\`

OPERADORES DE ASSERTION disponíveis:
- exists, notExists, equals, notEquals, contains, greaterThan, lessThan, isArray, isObject

REGRAS:
- Sempre inclua pelo menos: teste de sucesso, teste 404, teste de autenticação negada (401)
- Use nomes descritivos nos testes
- Inclua assertions relevantes para cada endpoint
- Se pedir para salvar, adicione: [SALVAR: nome-do-arquivo.json]
- Responda SEMPRE em português brasileiro`;

export class TestAgent {
  constructor(ollamaClient, bus) {
    this.client = ollamaClient;
    this.bus = bus;
    this.runner = new TestRunner();
  }

  async handle({ userMessage, messages, model, streaming, onToken, context }) {
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

    // Detecta se deve salvar a suite
    const saveMatch = content.match(/\[SALVAR:\s*([^\]]+\.json)\]/i);
    let action = null;
    let data = null;

    if (saveMatch) {
      const suite = this._extractSuiteJson(content);
      if (suite) {
        action = 'save_suite';
        data = { filename: saveMatch[1].trim(), suite };
      }
    }

    // Detecta se deve executar a suite
    const runMatch = content.match(/\[EXECUTAR[_-]SUITE:\s*([^\]]+)\]/i);
    if (runMatch) {
      const suite = this._extractSuiteJson(content);
      if (suite) {
        action = 'run_suite';
        data = { suite };
      }
    }

    return {
      content,
      agentUsed: 'test-agent',
      stats,
      action,
      data,
    };
  }

  /**
   * Salva uma suite de testes em arquivo
   */
  async saveSuite(suite, filename) {
    await fs.writeFile(filename, JSON.stringify(suite, null, 2), 'utf8');
  }

  /**
   * Executa uma suite via TestRunner
   */
  async runSuite(suite) {
    return this.runner.runSuite(suite);
  }

  // ─────────────────────────────────────────────
  //  INTERNALS
  // ─────────────────────────────────────────────

  _enrichMessages(messages, context) {
    if (!context?.request) return messages;
    const { request } = context;
    const note = `\n[CONTEXTO] O usuário já tem uma requisição: ${request.method} ${request.url}. Use isso como base da suite.`;
    const enriched = [...messages];
    if (enriched[0]?.role === 'system') {
      enriched[0] = { ...enriched[0], content: enriched[0].content + note };
    }
    return enriched;
  }

  _extractSuiteJson(content) {
    const match = content.match(/```json\n(\{[\s\S]+?\})\n```/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
}
