/**
 * MinicUrl AI — CodeAnalyzerAgent
 * Analisa uma pasta/projeto e identifica todas as comunicações com APIs.
 *
 * Detecta: fetch, axios, http/https nativo, XMLHttpRequest, got, ky,
 *          superagent, request, node-fetch, aiohttp (Python), requests (Python)
 *
 * Fluxo:
 *  1. Escaneia arquivos recursivamente
 *  2. Extrai chamadas de API (método, URL, headers, auth)
 *  3. Detecta padrões de auth (Bearer, Basic, OAuth, API Key)
 *  4. Identifica infos faltantes e pede ao usuário interativamente
 *  5. Gera suite de teste JSON compatível com TestRunner
 */

import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import { THEME } from '../../ui/renderer.js';
import { memoryManager } from '../memory.js';

// ─────────────────────────────────────────────
//  PADRÕES DE DETECÇÃO
// ─────────────────────────────────────────────

const PATTERNS = {
  // fetch() — JS/TS
  fetch: [
    /fetch\(\s*['"`]([^'"`]+)['"`]/g,
    /fetch\(\s*`([^`]+)`/g,
    /fetch\(\s*([A-Z_]+(?:\.[A-Z_]+)*)\s*[\+,]/g,  // constantes
  ],

  // axios
  axios: [
    /axios\.(get|post|put|patch|delete|head)\(\s*['"`]([^'"`]+)['"`]/g,
    /axios\(\s*\{[^}]*url\s*:\s*['"`]([^'"`]+)['"`]/g,
    /axios\.request\(\s*\{[^}]*url\s*:\s*['"`]([^'"`]+)['"`]/g,
  ],

  // http/https nativo Node.js
  nodeHttp: [
    /https?\.request\(\s*['"`]([^'"`]+)['"`]/g,
    /https?\.get\(\s*['"`]([^'"`]+)['"`]/g,
    /hostname\s*:\s*['"`]([^'"`]+)['"`]/g,
  ],

  // XMLHttpRequest
  xhr: [
    /\.open\(\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]\s*,\s*['"`]([^'"`]+)['"`]/gi,
  ],

  // got (HTTP lib)
  got: [
    /\bgot\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
    /\bgot\(\s*['"`]([^'"`]+)['"`]/g,
  ],

  // superagent
  superagent: [
    /request\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
  ],

  // Python requests
  pythonRequests: [
    /requests\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
    /requests\.(get|post|put|patch|delete)\(\s*f['"`]([^'"`]+)['"`]/g,
    /requests\.(get|post|put|patch|delete)\(\s*url/g,
  ],

  // Python aiohttp
  aiohttp: [
    /session\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
    /aiohttp\.ClientSession.*\.(get|post)\(\s*['"`]([^'"`]+)['"`]/g,
  ],
};

// Detecta padrões de auth
const AUTH_PATTERNS = {
  bearer: [
    /Authorization['":\s]+Bearer\s+([A-Za-z0-9._~+/-]+=*)/gi,
    /Bearer\s+\$?\{?([A-Z_]+)\}?/gi,
    /headers.*Authorization.*Bearer/gi,
  ],
  basic: [
    /Authorization['":\s]+Basic\s+([A-Za-z0-9+/=]+)/gi,
    /basicAuth|basic_auth|username.*password/gi,
  ],
  oauth: [
    /oauth|OAuth|access_token|refresh_token|client_id|client_secret/gi,
    /grant_type.*client_credentials|authorization_code/gi,
  ],
  apiKey: [
    /api[_-]?key|x-api-key|apikey/gi,
    /X-API-Key|api_token/gi,
  ],
  cookie: [
    /Cookie|Set-Cookie|session_id|sessionid/gi,
  ],
};

// Extensões de arquivo suportadas
const SUPPORTED_EXTENSIONS = [
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.java', '.cs', '.php', '.rb',
  '.vue', '.svelte',
];

// Pastas ignoradas
const IGNORED_DIRS = [
  'node_modules', '.git', '.next', 'dist', 'build',
  '__pycache__', '.venv', 'venv', 'vendor', '.cache',
  'coverage', '.nyc_output', 'out',
];

// Arquivos ignorados
const IGNORED_FILES = [
  '.test.', '.spec.', '.d.ts', 'min.js',
];

// ─────────────────────────────────────────────
//  AGENT
// ─────────────────────────────────────────────

export class CodeAnalyzerAgent {
  constructor(ollamaClient, bus) {
    this.client = ollamaClient;
    this.bus = bus;
    this.foundApis = [];
    this.authInfo = {};
    this.missingInfo = {};
  }

  async handle({ userMessage, model }) {
    // Extrai o caminho da pasta da mensagem
    const folderPath = this._extractPath(userMessage);

    if (!folderPath) {
      return {
        content: [
          '## 🔭 Analisador de Código',
          '',
          'Por favor, informe o caminho da pasta para analisar:',
          '',
          '**Exemplos:**',
          '  `/analyze C:\\\\MeuProjeto`',
          '  `/analyze ./src`',
          '  `/analyze D:\\\\Projetos\\\\api-client`',
          '',
          'Posso detectar chamadas de API em: **JS/TS, Python, Go, Java, C#, PHP, Ruby**',
        ].join('\n'),
        agentUsed: 'code-analyzer',
      };
    }

    return await this.analyzeFolder(folderPath, model);
  }

  /**
   * Analisa uma pasta completa de forma interativa
   */
  async analyzeFolder(folderPath, model = null) {
    const absPath = path.resolve(folderPath);

    // Verifica se pasta existe
    try {
      await fs.access(absPath);
    } catch {
      return {
        content: `❌ Pasta não encontrada: \`${absPath}\`\n\nVerifique o caminho e tente novamente.`,
        agentUsed: 'code-analyzer',
      };
    }

    console.log('');
    console.log(THEME.success('  🔭 Iniciando análise de código...'));
    console.log(THEME.dim(`  📁 Pasta: ${absPath}\n`));

    // 1. Escaneia arquivos
    const files = await this._scanFiles(absPath);
    console.log(THEME.dim(`  📄 ${files.length} arquivo(s) encontrado(s)\n`));

    if (files.length === 0) {
      return {
        content: `❌ Nenhum arquivo suportado encontrado em \`${absPath}\`\n\nFormatos suportados: ${SUPPORTED_EXTENSIONS.join(', ')}`,
        agentUsed: 'code-analyzer',
      };
    }

    // 2. Extrai chamadas de API
    this.foundApis = [];
    let totalScanned = 0;
    for (const file of files) {
      const apis = await this._extractApisFromFile(file);
      this.foundApis.push(...apis);
      totalScanned++;

      if (totalScanned % 10 === 0) {
        process.stdout.write(`\r  ${THEME.primary('◐')} ${THEME.dim(`Analisando... ${totalScanned}/${files.length}`)}`);
      }
    }
    process.stdout.write('\r' + ' '.repeat(60) + '\r');

    // Deduplica e classifica
    this.foundApis = this._deduplicateApis(this.foundApis);

    console.log(THEME.success(`  ✓ ${this.foundApis.length} chamada(s) de API detectada(s)`));
    console.log('');

    if (this.foundApis.length === 0) {
      return {
        content: [
          '## 🔭 Análise Concluída',
          '',
          `Analisei **${files.length}** arquivos em \`${absPath}\` mas não encontrei chamadas de API.`,
          '',
          '**Possíveis razões:**',
          '- As chamadas usam uma biblioteca não detectada',
          '- A URL é construída dinamicamente (variáveis)',
          '- O projeto usa GraphQL ou WebSockets',
          '',
          'Posso analisar manualmente se você colar um trecho do código aqui.',
        ].join('\n'),
        agentUsed: 'code-analyzer',
      };
    }

    // 3. Exibe o que foi encontrado
    this._printFoundApis();

    // 4. Detecta informações faltantes e pede ao usuário
    const missing = this._detectMissingInfo();
    if (missing.length > 0) {
      await this._interactiveGatherInfo(missing);
    }

    // 5. Gera suite de testes com IA
    const suite = await this._generateTestSuite(absPath, model);

    // 6. Salva na memória
    await memoryManager.saveProjectAnalysis(absPath, {
      files: files.length,
      apisFound: this.foundApis.length,
      authTypes: [...new Set(this.foundApis.map(a => a.authType).filter(Boolean))],
    });

    // Para cada API encontrada, registra na memória de padrões
    for (const api of this.foundApis.slice(0, 20)) {
      if (api.url?.startsWith('http')) {
        await memoryManager.addApiPattern({
          method: api.method || 'GET',
          url: api.url,
          source: api.file,
          authType: api.authType,
        });
      }
    }

    return {
      content: this._buildResultMessage(absPath, suite),
      agentUsed: 'code-analyzer',
      action: suite ? 'save_suite' : null,
      data: suite ? { suite, filename: `test-suite-${path.basename(absPath)}.json` } : null,
    };
  }

  // ─────────────────────────────────────────────
  //  SCAN DE ARQUIVOS
  // ─────────────────────────────────────────────

  async _scanFiles(dirPath, result = []) {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return result;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.includes(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this._scanFiles(fullPath, result);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const isIgnored = IGNORED_FILES.some(f => entry.name.includes(f));
        if (SUPPORTED_EXTENSIONS.includes(ext) && !isIgnored) {
          result.push(fullPath);
        }
      }
    }
    return result;
  }

  // ─────────────────────────────────────────────
  //  EXTRAÇÃO DE APIs
  // ─────────────────────────────────────────────

  async _extractApisFromFile(filePath) {
    const apis = [];
    let content;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      return apis;
    }

    const ext = path.extname(filePath).toLowerCase();
    const relativePath = path.relative(process.cwd(), filePath);

    // ── fetch ──────────────────────────────────
    for (const pattern of PATTERNS.fetch) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(content)) !== null) {
        const url = m[1];
        if (url && (url.startsWith('http') || url.includes('${'))) {
          apis.push(this._buildApiEntry('GET', url, relativePath, content, m.index));
        }
      }
    }

    // ── axios ──────────────────────────────────
    for (const pattern of PATTERNS.axios) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(content)) !== null) {
        const method = (m[1] || 'GET').toUpperCase();
        const url = m[2] || m[1];
        if (url && (url.startsWith('http') || url.includes('${') || url.startsWith('/'))) {
          apis.push(this._buildApiEntry(method, url, relativePath, content, m.index));
        }
      }
    }

    // ── xhr ───────────────────────────────────
    for (const pattern of PATTERNS.xhr) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(content)) !== null) {
        const method = m[1].toUpperCase();
        const url = m[2];
        if (url) {
          apis.push(this._buildApiEntry(method, url, relativePath, content, m.index));
        }
      }
    }

    // ── Python requests ────────────────────────
    if (ext === '.py') {
      for (const pattern of PATTERNS.pythonRequests) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(content)) !== null) {
          const method = (m[1] || 'GET').toUpperCase();
          const url = m[2];
          if (url) apis.push(this._buildApiEntry(method, url, relativePath, content, m.index));
        }
      }
    }

    // ── got / superagent ───────────────────────
    for (const lib of ['got', 'superagent']) {
      for (const pattern of PATTERNS[lib]) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(content)) !== null) {
          const method = m.length > 2 ? (m[1] || 'GET').toUpperCase() : 'GET';
          const url = m.length > 2 ? m[2] : m[1];
          if (url && (url.startsWith('http') || url.startsWith('/'))) {
            apis.push(this._buildApiEntry(method, url, relativePath, content, m.index));
          }
        }
      }
    }

    return apis;
  }

  _buildApiEntry(method, url, file, content, index) {
    // Pega contexto de ~300 chars ao redor da detecção para detectar auth
    const context = content.substring(Math.max(0, index - 200), index + 300);
    const authType = this._detectAuthInContext(context);
    const authVariable = this._detectAuthVariable(context);

    return {
      method: method.length <= 7 ? method : 'GET',
      url: url.trim(),
      file,
      authType,
      authVariable,
      context: context.trim().substring(0, 200),
    };
  }

  _detectAuthInContext(context) {
    for (const [type, patterns] of Object.entries(AUTH_PATTERNS)) {
      for (const p of patterns) {
        const test = new RegExp(p.source, p.flags.replace('g', ''));
        if (test.test(context)) return type;
      }
    }
    return null;
  }

  _detectAuthVariable(context) {
    // Detecta nomes de variáveis de token/key frequentes
    const varPatterns = [
      /process\.env\.([A-Z_]+(?:TOKEN|KEY|SECRET|PASSWORD)[A-Z_]*)/g,
      /env\.([A-Z_]+(?:TOKEN|KEY|SECRET)[A-Z_]*)/g,
      /import\.meta\.env\.([A-Z_]+)/g,
      /\$?(\w*(?:TOKEN|KEY|SECRET|PASSWORD)\w*)/gi,
    ];
    for (const p of varPatterns) {
      p.lastIndex = 0;
      const m = p.exec(context);
      if (m) return m[1];
    }
    return null;
  }

  _deduplicateApis(apis) {
    const seen = new Set();
    return apis.filter(api => {
      // Normaliza URL (remove trailing slash, query params)
      const normalUrl = api.url.split('?')[0].replace(/\/$/, '');
      const key = `${api.method}:${normalUrl}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ─────────────────────────────────────────────
  //  DETECÇÃO DE INFO FALTANTE
  // ─────────────────────────────────────────────

  _detectMissingInfo() {
    const missing = [];
    const authTypes = [...new Set(this.foundApis.map(a => a.authType).filter(Boolean))];

    // Base URL dinâmica?
    const dynamicUrls = this.foundApis.filter(a =>
      a.url.includes('${') || a.url.includes('process.env') ||
      a.url.startsWith('/') || !a.url.startsWith('http')
    );
    if (dynamicUrls.length > 0) {
      missing.push({
        type: 'base_url',
        label: 'URL base da API',
        description: `${dynamicUrls.length} endpoint(s) com URL relativa ou dinâmica`,
        examples: dynamicUrls.slice(0, 3).map(a => a.url),
        required: true,
      });
    }

    // Auth Bearer
    if (authTypes.includes('bearer')) {
      missing.push({
        type: 'bearer_token',
        label: 'Bearer Token',
        description: 'Encontrei endpoints que usam autenticação Bearer',
        variables: [...new Set(
          this.foundApis
            .filter(a => a.authType === 'bearer' && a.authVariable)
            .map(a => a.authVariable)
        )],
        required: false,
      });
    }

    // Auth OAuth
    if (authTypes.includes('oauth')) {
      missing.push({
        type: 'oauth',
        label: 'OAuth 2.0',
        description: 'Encontrei fluxo OAuth. Preciso das credenciais para gerar testes completos.',
        required: false,
        subFields: ['client_id', 'client_secret', 'token_url', 'scope'],
      });
    }

    // API Key
    if (authTypes.includes('apiKey')) {
      missing.push({
        type: 'api_key',
        label: 'API Key',
        description: 'Encontrei endpoints que usam API Key',
        required: false,
      });
    }

    // Basic Auth
    if (authTypes.includes('basic')) {
      missing.push({
        type: 'basic_auth',
        label: 'Basic Auth',
        description: 'Encontrei autenticação Basic',
        required: false,
      });
    }

    return missing;
  }

  async _interactiveGatherInfo(missing) {
    console.log('');
    console.log(THEME.warning('  ⚠️  Informações necessárias para gerar os testes:\n'));

    for (const item of missing) {
      console.log(THEME.accent(`  📋 ${item.label}`) + THEME.dim(` — ${item.description}`));

      if (item.examples?.length) {
        console.log(THEME.dim('     Exemplos encontrados:'));
        for (const ex of item.examples.slice(0, 3)) {
          console.log(THEME.dim(`       · ${ex}`));
        }
      }
      if (item.variables?.length) {
        console.log(THEME.dim(`     Variáveis: ${item.variables.join(', ')}`));
      }
      console.log('');

      if (item.type === 'base_url') {
        const { value } = await inquirer.prompt([{
          type: 'input',
          name: 'value',
          message: 'URL base da API (ex: https://api.meusite.com):',
          prefix: THEME.accent('  ◈'),
          validate: (v) => {
            if (!v.trim()) return true; // opcional, mas avisa
            try { new URL(v); return true; } catch { return 'URL inválida'; }
          },
        }]);
        if (value.trim()) this.missingInfo.baseUrl = value.trim();
      }

      if (item.type === 'bearer_token') {
        const { add } = await inquirer.prompt([{
          type: 'confirm',
          name: 'add',
          message: 'Deseja informar um Bearer token para os testes?',
          prefix: THEME.accent('  ◈'),
          default: false,
        }]);
        if (add) {
          const { value } = await inquirer.prompt([{
            type: 'password',
            name: 'value',
            message: 'Bearer Token:',
            prefix: THEME.accent('  ◈'),
            mask: '●',
          }]);
          if (value.trim()) this.missingInfo.bearerToken = value.trim();
        }
      }

      if (item.type === 'oauth') {
        const { add } = await inquirer.prompt([{
          type: 'confirm',
          name: 'add',
          message: 'Deseja configurar OAuth 2.0 para os testes?',
          prefix: THEME.accent('  ◈'),
          default: false,
        }]);
        if (add) {
          const answers = await inquirer.prompt([
            { type: 'input', name: 'clientId', message: 'client_id:', prefix: THEME.accent('    →') },
            { type: 'password', name: 'clientSecret', message: 'client_secret:', prefix: THEME.accent('    →'), mask: '●' },
            { type: 'input', name: 'tokenUrl', message: 'Token URL (ex: https://auth.api.com/oauth/token):', prefix: THEME.accent('    →') },
            { type: 'input', name: 'scope', message: 'Scope (opcional):', prefix: THEME.accent('    →') },
          ]);
          this.missingInfo.oauth = answers;
        }
      }

      if (item.type === 'api_key') {
        const { add } = await inquirer.prompt([{
          type: 'confirm',
          name: 'add',
          message: 'Deseja informar a API Key?',
          prefix: THEME.accent('  ◈'),
          default: false,
        }]);
        if (add) {
          const answers = await inquirer.prompt([
            { type: 'input', name: 'headerName', message: 'Nome do header (ex: X-API-Key):', prefix: THEME.accent('    →'), default: 'X-API-Key' },
            { type: 'password', name: 'value', message: 'Valor:', prefix: THEME.accent('    →'), mask: '●' },
          ]);
          this.missingInfo.apiKey = answers;
        }
      }

      if (item.type === 'basic_auth') {
        const { add } = await inquirer.prompt([{
          type: 'confirm',
          name: 'add',
          message: 'Deseja informar usuário/senha para Basic Auth?',
          prefix: THEME.accent('  ◈'),
          default: false,
        }]);
        if (add) {
          const answers = await inquirer.prompt([
            { type: 'input', name: 'user', message: 'Usuário:', prefix: THEME.accent('    →') },
            { type: 'password', name: 'pass', message: 'Senha:', prefix: THEME.accent('    →'), mask: '●' },
          ]);
          this.missingInfo.basicAuth = answers;
        }
      }
    }
    console.log('');
  }

  // ─────────────────────────────────────────────
  //  GERAÇÃO DE SUITE COM IA
  // ─────────────────────────────────────────────

  async _generateTestSuite(folderPath, model) {
    if (!this.client || !model) return this._generateSuiteLocally(folderPath);

    // Tenta usar IA para gerar suite mais completa
    try {
      const prompt = this._buildGenerationPrompt(folderPath);
      const spinner = require.resolve ? null : this._buildSpinner();
      if (spinner) spinner.msg = 'IA gerando suite de testes...';

      process.stdout.write(THEME.dim('\n  🤖 IA analisando endpoints e gerando testes...'));

      const res = await this.client.chat([
        {
          role: 'system',
          content: `Você é um especialista em testes de API. Gere uma suite de testes JSON no formato MinicUrl baseada nos endpoints fornecidos. Retorne SOMENTE o JSON válido, sem explicações.`,
        },
        { role: 'user', content: prompt },
      ], model, { maxTokens: 3000 });

      process.stdout.write(THEME.success(' ✓\n'));

      // Tenta extrair JSON da resposta
      const jsonMatch = res.content.match(/\{[\s\S]+\}/);
      if (jsonMatch) {
        const suite = JSON.parse(jsonMatch[0]);
        return this._enrichSuiteWithAuth(suite);
      }
    } catch {
      // Fallback: gera suite sem IA
    }

    return this._generateSuiteLocally(folderPath);
  }

  _buildGenerationPrompt(folderPath) {
    const apiList = this.foundApis.slice(0, 30).map(a =>
      `- ${a.method} ${this._resolveUrl(a.url)} (auth: ${a.authType || 'none'}, arquivo: ${a.file})`
    ).join('\n');

    return `Analise estes endpoints encontrados no projeto "${path.basename(folderPath)}" e gere uma suite de testes JSON:

${apiList}

${this.missingInfo.baseUrl ? `URL base: ${this.missingInfo.baseUrl}` : ''}

Gere uma suite no formato:
{
  "name": "Suite - ${path.basename(folderPath)}",
  "baseUrl": "...",
  "headers": {},
  "tests": [
    {
      "name": "...",
      "method": "GET",
      "url": "...",
      "expectedStatus": 200,
      "assertions": [...]
    }
  ]
}

Inclua: teste de sucesso, teste 401 (sem auth), teste 404, e testes CRUD quando aplicável.`;
  }

  _generateSuiteLocally(folderPath) {
    // Gera suite básica sem IA
    const baseUrl = this.missingInfo.baseUrl || 'https://api.exemplo.com';
    const tests = [];

    // Gera um teste por endpoint único
    for (const api of this.foundApis.slice(0, 20)) {
      const url = this._resolveUrl(api.url, baseUrl);
      if (!url.startsWith('http')) continue;

      const headers = this._buildHeaders(api);

      tests.push({
        name: `${api.method} ${this._getPathFromUrl(url)}`,
        method: api.method,
        url,
        headers,
        expectedStatus: api.method === 'POST' ? 201 : 200,
        assertions: [
          { type: 'status', expected: api.method === 'POST' ? 201 : 200 },
          { type: 'response_time', expected: 3000 },
        ],
      });

      // Teste de acesso não autenticado (se há auth)
      if (api.authType && api.authType !== 'none') {
        tests.push({
          name: `${api.method} ${this._getPathFromUrl(url)} — sem auth (espera 401)`,
          method: api.method,
          url,
          headers: {},
          expectedStatus: 401,
          assertions: [
            { type: 'status', expected: 401 },
          ],
        });
      }
    }

    return {
      name: `Suite — ${path.basename(folderPath)}`,
      baseUrl: this.missingInfo.baseUrl || 'https://api.exemplo.com',
      generatedAt: new Date().toISOString(),
      generatedBy: 'MinicUrl CodeAnalyzer',
      headers: this._buildGlobalHeaders(),
      tests,
    };
  }

  _enrichSuiteWithAuth(suite) {
    const globalHeaders = this._buildGlobalHeaders();
    suite.headers = { ...(suite.headers || {}), ...globalHeaders };
    return suite;
  }

  _buildHeaders(api) {
    const headers = {};
    if (api.authType === 'bearer' && this.missingInfo.bearerToken) {
      headers['Authorization'] = `Bearer ${this.missingInfo.bearerToken}`;
    }
    if (api.authType === 'apiKey' && this.missingInfo.apiKey) {
      headers[this.missingInfo.apiKey.headerName] = this.missingInfo.apiKey.value;
    }
    if (api.authType === 'basic' && this.missingInfo.basicAuth) {
      const encoded = Buffer.from(`${this.missingInfo.basicAuth.user}:${this.missingInfo.basicAuth.pass}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    }
    return headers;
  }

  _buildGlobalHeaders() {
    const headers = {};
    if (this.missingInfo.bearerToken) {
      headers['Authorization'] = `Bearer ${this.missingInfo.bearerToken}`;
    }
    if (this.missingInfo.apiKey) {
      headers[this.missingInfo.apiKey.headerName] = this.missingInfo.apiKey.value;
    }
    if (this.missingInfo.basicAuth) {
      const encoded = Buffer.from(`${this.missingInfo.basicAuth.user}:${this.missingInfo.basicAuth.pass}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    }
    return headers;
  }

  _resolveUrl(url, baseUrl = '') {
    if (url.startsWith('http')) return url;
    if (url.startsWith('/') && baseUrl) return baseUrl.replace(/\/$/, '') + url;
    if (url.includes('${') && baseUrl) {
      // Substitui template literals pelo baseUrl
      return url.replace(/\$\{[^}]+\}/g, baseUrl.replace(/\/$/, ''));
    }
    return baseUrl ? `${baseUrl}/${url}` : url;
  }

  _getPathFromUrl(url) {
    try { return new URL(url).pathname; } catch { return url; }
  }

  // ─────────────────────────────────────────────
  //  DISPLAY
  // ─────────────────────────────────────────────

  _printFoundApis() {
    const authColors = {
      bearer: THEME.warning,
      oauth: THEME.secondary,
      apiKey: THEME.accent,
      basic: THEME.info,
      cookie: THEME.muted,
    };

    console.log(THEME.primary('  📋 Endpoints detectados:\n'));

    const methodColors = {
      GET: THEME.success,
      POST: THEME.info,
      PUT: THEME.warning,
      PATCH: THEME.accent,
      DELETE: THEME.error,
    };

    for (const api of this.foundApis.slice(0, 25)) {
      const mc = methodColors[api.method] || THEME.white;
      const method = mc(api.method.padEnd(7));
      const url = api.url.length > 50 ? api.url.substring(0, 47) + '...' : api.url;
      const auth = api.authType ? (authColors[api.authType] || THEME.dim)(`[${api.authType}]`) : THEME.dim('[public]');
      console.log(`  ${THEME.dim('▸')} ${method} ${THEME.white(url)} ${auth}`);
      console.log(THEME.dim(`        ${api.file}`));
    }

    if (this.foundApis.length > 25) {
      console.log(THEME.dim(`  ... e mais ${this.foundApis.length - 25} endpoint(s)`));
    }
    console.log('');
  }

  _buildResultMessage(folderPath, suite) {
    const authTypes = [...new Set(this.foundApis.map(a => a.authType).filter(Boolean))];
    const lines = [
      `## 🔭 Análise Concluída — \`${path.basename(folderPath)}\``,
      '',
      `**${this.foundApis.length}** endpoint(s) de API detectado(s)`,
      `**${suite?.tests?.length || 0}** caso(s) de teste gerado(s)`,
      '',
      '### Auth detectado',
      authTypes.length > 0
        ? authTypes.map(t => `- \`${t}\``).join('\n')
        : '- Nenhuma autenticação detectada (endpoints públicos)',
      '',
      '### Suite gerada',
      `A suite de testes está pronta para salvar como arquivo \`.json\``,
      'Use o TestRunner do MinicUrl para executar: **🧪 API Test Runner** no menu.',
      '',
      '### Próximos passos',
      '1. Salve a suite e execute com `minicurl`',
      '2. Revise os endpoints que precisam de auth',
      '3. Use `/analyze <pasta>` para analisar outros projetos',
    ];
    return lines.join('\n');
  }

  _extractPath(message) {
    // Tenta extrair caminho de: /analyze <path>, "analise a pasta X", "analise X"
    const patterns = [
      /\/analyze\s+(.+)/i,
      /analise\s+(?:a\s+pasta\s+)?(.+)/i,
      /analise\s+o\s+projeto\s+(.+)/i,
      /escanear?\s+(.+)/i,
      /scan\s+(.+)/i,
      /([A-Za-z]:\\[^\s]+)/,       // Windows path
      /(\/[^\s]+)/,                 // Unix path
      /\.\/?([^\s]+)/,              // Relative path
    ];

    for (const p of patterns) {
      const m = message.match(p);
      if (m && m[1]?.trim()) {
        const candidate = m[1].trim().replace(/['"]/g, '');
        // Filtra URLs (não são caminhos)
        if (!candidate.startsWith('http')) return candidate;
      }
    }
    return null;
  }
}
