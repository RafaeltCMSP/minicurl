/**
 * MinicUrl Test Runner - Suite de testes para APIs
 */

import fs from 'fs/promises';
import path from 'path';
import { RequestEngine } from './engine.js';

const engine = new RequestEngine();

export class TestRunner {
  constructor() {
    this.results = [];
  }

  // ─── Executa uma suite de testes a partir de um arquivo JSON/YAML ───
  async runSuite(suiteFile, COLORS) {
    let suite;
    try {
      const raw = await fs.readFile(suiteFile, 'utf8');
      suite = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Não foi possível carregar suite: ${err.message}`);
    }

    console.log('\n' + COLORS.warning(`  🧪 Suite: ${suite.name || suiteFile}`));
    console.log(COLORS.dim('  ' + '─'.repeat(50)) + '\n');

    const results = [];
    let passed = 0;
    let failed = 0;

    for (const test of suite.tests) {
      const result = await this.runSingleTest(test, COLORS);
      results.push(result);
      if (result.passed) passed++;
      else failed++;
    }

    // Resumo
    console.log('\n' + COLORS.dim('  ' + '─'.repeat(50)));
    console.log(
      `  Resultado: ` +
      COLORS.success(`${passed} passou`) + COLORS.dim(' / ') +
      (failed > 0 ? COLORS.error(`${failed} falhou`) : COLORS.dim(`${failed} falhou`))
    );
    console.log(COLORS.dim('  ' + '─'.repeat(50)) + '\n');

    return results;
  }

  async runSingleTest(test, COLORS) {
    process.stdout.write(`  ${COLORS.dim('►')} ${test.name.padEnd(40)}`);

    const assertions = test.assertions || [];
    const testResults = [];
    let passed = true;

    try {
      const start = Date.now();
      const res = await engine.request({
        method: test.method,
        url: test.url,
        headers: test.headers || {},
        body: test.body,
        timeout: (test.timeout || 30) * 1000,
      });
      const duration = Date.now() - start;

      // Avalia assertions
      for (const assertion of assertions) {
        const assertResult = this.evaluate(assertion, res);
        testResults.push(assertResult);
        if (!assertResult.passed) passed = false;
      }

      if (passed) {
        console.log(COLORS.success('✓ PASS') + COLORS.dim(` (${duration}ms)`));
      } else {
        console.log(COLORS.error('✗ FAIL') + COLORS.dim(` (${duration}ms)`));
        for (const tr of testResults.filter(r => !r.passed)) {
          console.log(COLORS.error(`    ↳ ${tr.message}`));
        }
      }

      return { name: test.name, passed, duration, assertions: testResults };
    } catch (err) {
      console.log(COLORS.error('✗ ERROR') + COLORS.dim(` ${err.message}`));
      return { name: test.name, passed: false, error: err.message, assertions: [] };
    }
  }

  evaluate(assertion, response) {
    const { type, expected } = assertion;

    switch (type) {
      case 'status':
        return {
          passed: response.status === expected,
          message: `Status esperado ${expected}, recebido ${response.status}`,
        };

      case 'status_range':
        const [min, max] = expected;
        return {
          passed: response.status >= min && response.status <= max,
          message: `Status ${response.status} fora do range [${min}-${max}]`,
        };

      case 'header_exists':
        return {
          passed: expected.toLowerCase() in response.headers,
          message: `Header '${expected}' não encontrado`,
        };

      case 'header_equals':
        return {
          passed: response.headers[assertion.header?.toLowerCase()] === expected,
          message: `Header '${assertion.header}' esperado '${expected}'`,
        };

      case 'body_contains':
        const bodyStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        return {
          passed: bodyStr.includes(expected),
          message: `Body não contém '${expected}'`,
        };

      case 'json_path': {
        try {
          const data = typeof response.data === 'object' ? response.data : JSON.parse(response.data);
          const val = getPath(data, assertion.path);
          const ok = assertion.operator === 'exists'
            ? val !== undefined
            : String(val) === String(expected);
          return {
            passed: ok,
            message: `${assertion.path} = ${JSON.stringify(val)}, esperado ${JSON.stringify(expected)}`,
          };
        } catch {
          return { passed: false, message: `Erro ao avaliar path '${assertion.path}'` };
        }
      }

      case 'response_time':
        return {
          passed: response.duration <= expected,
          message: `Tempo ${response.duration}ms excedeu limite de ${expected}ms`,
        };

      default:
        return { passed: false, message: `Tipo de assertion desconhecido: ${type}` };
    }
  }

  // ─── Menu interativo do test runner ───
  async interactiveMenu(COLORS, inquirer) {
    console.log('\n' + COLORS.warning('  🧪 API TEST RUNNER') + '\n');

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'O que deseja fazer?',
        prefix: COLORS.accent('  ◈'),
        choices: [
          { name: COLORS.primary('📁 Carregar suite de testes (JSON)'), value: 'load' },
          { name: COLORS.info('✍  Criar teste rápido interativo'), value: 'quick' },
          { name: COLORS.warning('📊 Ver template de suite'), value: 'template' },
          { name: COLORS.dim('↩  Voltar'), value: 'back' },
        ],
      },
    ]);

    if (action === 'load') {
      const { filepath } = await inquirer.prompt([
        { type: 'input', name: 'filepath', message: 'Caminho do arquivo de suite:', prefix: COLORS.accent('  ◈') },
      ]);
      try {
        await this.runSuite(filepath.trim(), COLORS);
      } catch (err) {
        console.log(COLORS.error(`  ✗ ${err.message}`));
      }
    } else if (action === 'quick') {
      await this.quickTest(COLORS, inquirer);
    } else if (action === 'template') {
      this.showTemplate(COLORS);
    }
  }

  async quickTest(COLORS, inquirer) {
    console.log('\n' + COLORS.info('  ✍ TESTE RÁPIDO') + '\n');

    const answers = await inquirer.prompt([
      { type: 'list', name: 'method', message: 'Método:', prefix: COLORS.accent('  ◈'),
        choices: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { type: 'input', name: 'url', message: 'URL:', prefix: COLORS.accent('  ◈') },
      { type: 'input', name: 'expectedStatus', message: 'Status esperado:', prefix: COLORS.accent('  ◈'), default: '200' },
      { type: 'input', name: 'maxTime', message: 'Tempo máximo (ms):', prefix: COLORS.accent('  ◈'), default: '2000' },
    ]);

    const test = {
      name: `${answers.method} ${answers.url}`,
      method: answers.method,
      url: answers.url,
      assertions: [
        { type: 'status', expected: parseInt(answers.expectedStatus) },
        { type: 'response_time', expected: parseInt(answers.maxTime) },
      ],
    };

    await this.runSingleTest(test, COLORS);
  }

  showTemplate(COLORS) {
    const template = {
      name: "Minha Suite de Testes",
      baseUrl: "https://api.exemplo.com",
      tests: [
        {
          name: "GET /users retorna 200",
          method: "GET",
          url: "https://api.exemplo.com/users",
          headers: { "Authorization": "Bearer {TOKEN}" },
          assertions: [
            { type: "status", expected: 200 },
            { type: "response_time", expected: 1000 },
            { type: "header_exists", expected: "content-type" },
            { type: "json_path", path: "data", operator: "exists" },
          ],
        },
        {
          name: "POST /users cria usuário",
          method: "POST",
          url: "https://api.exemplo.com/users",
          body: { name: "Teste", email: "teste@email.com" },
          assertions: [
            { type: "status", expected: 201 },
            { type: "body_contains", expected: "Teste" },
          ],
        },
      ],
    };

    console.log('\n' + COLORS.dim('  Template de suite (salve como suite.json):'));
    console.log(JSON.stringify(template, null, 2)
      .split('\n')
      .map(l => COLORS.muted('  ') + l)
      .join('\n') + '\n');
  }
}

function getPath(obj, dotPath) {
  return dotPath.split('.').reduce((acc, key) => acc?.[key], obj);
}
