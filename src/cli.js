/**
 * MinicUrl CLI - Modo linha de comando direto (não-interativo)
 * Uso: minicurl get https://api.com
 *      minicurl post https://api.com -d '{"key":"val"}' -H "Auth: Bearer x"
 */

import chalk from 'chalk';
import { RequestEngine } from './core/engine.js';
import { displayResult } from './ui/display.js';

const COLORS = {
  primary: chalk.hex('#00FFB2'),
  secondary: chalk.hex('#FF6B35'),
  accent: chalk.hex('#7B2FBE'),
  dim: chalk.hex('#4A4A6A'),
  success: chalk.hex('#39FF14'),
  error: chalk.hex('#FF3131'),
  warning: chalk.hex('#FFD700'),
  info: chalk.hex('#00D4FF'),
  white: chalk.white,
  muted: chalk.gray,
};

const engine = new RequestEngine();

export async function runCLI() {
  const args = process.argv.slice(2);

  if (args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return;
  }

  if (args[0] === '--version' || args[0] === '-v') {
    console.log('MinicUrl v1.0.0');
    return;
  }

  const method = args[0]?.toUpperCase();
  const url = args[1];

  if (!method || !url) {
    showHelp();
    return;
  }

  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  if (!validMethods.includes(method)) {
    console.log(COLORS.error(`  ✗ Método inválido: ${method}`));
    console.log(COLORS.dim('  Válidos: ' + validMethods.join(', ')));
    return;
  }

  // Parse de flags
  const headers = {};
  let body = null;
  let timeout = 30;
  let output = null;
  let verbose = false;
  let toCurl = false;

  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case '-H':
      case '--header':
        const headerStr = args[++i];
        if (headerStr) {
          const [k, ...rest] = headerStr.split(':');
          headers[k.trim()] = rest.join(':').trim();
        }
        break;
      case '-d':
      case '--data':
        const rawData = args[++i];
        try { body = JSON.parse(rawData); } catch { body = rawData; }
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        break;
      case '-t':
      case '--timeout':
        timeout = parseInt(args[++i]) || 30;
        break;
      case '-o':
      case '--output':
        output = args[++i];
        break;
      case '-v':
      case '--verbose':
        verbose = true;
        break;
      case '--curl':
        toCurl = true;
        break;
    }
  }

  if (toCurl) {
    console.log(engine.toCurl({ method, url, headers, body }));
    return;
  }

  // Verbose: mostra request antes de enviar
  if (verbose) {
    console.log(COLORS.dim('\n  ─── Request ───'));
    console.log(COLORS.primary(`  ${method} ${url}`));
    if (Object.keys(headers).length > 0) {
      for (const [k, v] of Object.entries(headers)) {
        console.log(COLORS.dim(`  ${k}: ${v}`));
      }
    }
    if (body) {
      console.log(COLORS.dim('\n  Body:'));
      console.log(COLORS.muted('  ' + JSON.stringify(body, null, 2).replace(/\n/g, '\n  ')));
    }
    console.log(COLORS.dim('  ─────────────\n'));
  }

  try {
    const result = await engine.request({ method, url, headers, body, timeout: timeout * 1000 });

    await displayResult(result, method, url, COLORS);

    if (output) {
      await engine.saveToFile(result, output);
      console.log(COLORS.success(`  ✓ Salvo em ${output}`));
    }

    // Exit code baseado no status
    process.exit(result.status >= 400 ? 1 : 0);
  } catch (err) {
    console.log(COLORS.error(`\n  ✗ ${err.message}\n`));
    process.exit(1);
  }
}

function showHelp() {
  const c = COLORS;
  console.log(`
${c.primary('  MinicUrl')} ${c.dim('v1.0.0 — HTTP Client & cURL Academy')}

${c.warning('  MODO INTERATIVO (TUI):')}
  ${c.success('minicurl')}                     ${c.dim('— Abre a interface interativa animada')}

${c.warning('  MODO CLI DIRETO:')}
  ${c.success('minicurl')} ${c.primary('<método>')} ${c.info('<url>')} ${c.dim('[opções]')}

${c.warning('  MÉTODOS:')}
  ${c.success('get post put patch delete head options')}

${c.warning('  OPÇÕES:')}
  ${c.primary('-H, --header')} ${c.dim('"Key: Value"')}    ${c.dim('Adiciona um header')}
  ${c.primary('-d, --data')}   ${c.dim('"json ou texto"')}  ${c.dim('Body da requisição')}
  ${c.primary('-t, --timeout')} ${c.dim('<segundos>')}      ${c.dim('Timeout (padrão: 30s)')}
  ${c.primary('-o, --output')} ${c.dim('<arquivo>')}        ${c.dim('Salva resposta em arquivo')}
  ${c.primary('-v, --verbose')}                  ${c.dim('Mostra detalhes da requisição')}
  ${c.primary('--curl')}                        ${c.dim('Converte para cURL sem executar')}

${c.warning('  EXEMPLOS:')}
  ${c.dim('# GET simples')}
  ${c.success('minicurl get')} https://api.github.com/users/octocat

  ${c.dim('# POST com JSON')}
  ${c.success('minicurl post')} https://httpbin.org/post \\
    ${c.primary('-H')} "Content-Type: application/json" \\
    ${c.primary('-d')} '{"name":"Teste","value":42}'

  ${c.dim('# Com autenticação Bearer')}
  ${c.success('minicurl get')} https://api.exemplo.com/me \\
    ${c.primary('-H')} "Authorization: Bearer meu-token"

  ${c.dim('# Salvar resposta em arquivo')}
  ${c.success('minicurl get')} https://api.exemplo.com/data ${c.primary('-o')} resultado.json

  ${c.dim('# Ver cURL equivalente')}
  ${c.success('minicurl post')} https://api.com/users ${c.primary('-d')} '{"x":1}' ${c.primary('--curl')}
`);
}
