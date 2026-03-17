/**
 * MinicUrl Academy - Módulo de aprendizado interativo de HTTP/cURL
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { RequestEngine } from '../core/engine.js';

const engine = new RequestEngine();

// ─────────────────────────────────────────────
//  LIÇÕES COMPLETAS DE HTTP/cURL
// ─────────────────────────────────────────────
const LESSONS = [
  {
    id: 1,
    title: '🌐 O que é HTTP?',
    category: 'Fundamentos',
    content: [
      {
        type: 'text',
        text: `HTTP (HyperText Transfer Protocol) é o protocolo de comunicação da web.
É baseado no modelo cliente-servidor: o cliente faz uma requisição e o servidor responde.

Toda comunicação HTTP segue este padrão:
  1. Cliente envia uma REQUEST (método + URL + headers + body opcional)
  2. Servidor processa e retorna uma RESPONSE (status + headers + body)`,
      },
      {
        type: 'example',
        label: 'Requisição mais simples possível:',
        code: `GET /index.html HTTP/1.1
Host: www.exemplo.com
User-Agent: MinicUrl/1.0`,
      },
      {
        type: 'example',
        label: 'Resposta do servidor:',
        code: `HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 1234

<html>...</html>`,
      },
      {
        type: 'quiz',
        question: 'HTTP é um protocolo ___?',
        options: ['Stateful (com estado)', 'Stateless (sem estado)', 'Sempre seguro', 'Somente para APIs'],
        answer: 1,
        explanation: 'HTTP é stateless: cada requisição é independente. O servidor não "lembra" de requisições anteriores. Para manter estado, usamos cookies, sessions ou tokens.',
      },
    ],
  },

  {
    id: 2,
    title: '⚡ Métodos HTTP',
    category: 'Métodos',
    content: [
      {
        type: 'text',
        text: `Os métodos HTTP indicam a INTENÇÃO da requisição. Os principais são:

  GET     → Buscar/ler um recurso (não altera dados)
  POST    → Criar um novo recurso
  PUT     → Substituir um recurso completo
  PATCH   → Atualizar parcialmente um recurso
  DELETE  → Remover um recurso
  HEAD    → Como GET, mas retorna só os headers (sem body)
  OPTIONS → Descobre quais métodos o servidor aceita`,
      },
      {
        type: 'concept',
        label: 'Idempotência',
        text: `Um método é idempotente quando chamá-lo múltiplas vezes produz o mesmo resultado.
  • Idempotentes: GET, PUT, DELETE, HEAD, OPTIONS
  • NÃO idempotentes: POST (cada chamada pode criar um novo recurso)`,
      },
      {
        type: 'example',
        label: 'Equivalentes cURL:',
        code: `# GET - buscar usuário
curl -X GET https://api.exemplo.com/users/1

# POST - criar usuário
curl -X POST https://api.exemplo.com/users \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Ana","email":"ana@email.com"}'

# PUT - substituir completamente
curl -X PUT https://api.exemplo.com/users/1 \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Ana Silva","email":"ana@email.com","role":"admin"}'

# PATCH - atualizar só o nome
curl -X PATCH https://api.exemplo.com/users/1 \\
  -d '{"name":"Ana Silva"}'

# DELETE - remover
curl -X DELETE https://api.exemplo.com/users/1`,
      },
      {
        type: 'quiz',
        question: 'Qual método deve ser usado para CRIAR um novo recurso no servidor?',
        options: ['GET', 'PUT', 'POST', 'PATCH'],
        answer: 2,
        explanation: 'POST é usado para criar novos recursos. PUT substitui um recurso existente (ou cria se não existir, em alguns casos). A convenção REST usa POST para criação.',
      },
    ],
  },

  {
    id: 3,
    title: '📊 Status Codes HTTP',
    category: 'Status',
    content: [
      {
        type: 'text',
        text: `Os status codes informam o resultado da requisição. Organizados em famílias:

  1xx → Informacional   (processando...)
  2xx → Sucesso         (deu certo!)
  3xx → Redirecionamento (vai para outro lugar)
  4xx → Erro do cliente  (você errou algo)
  5xx → Erro do servidor (o servidor falhou)`,
      },
      {
        type: 'table',
        label: 'Os mais importantes:',
        rows: [
          ['200 OK', 'Sucesso padrão (GET/PUT/PATCH)'],
          ['201 Created', 'Recurso criado com sucesso (POST)'],
          ['204 No Content', 'Sucesso sem body (DELETE)'],
          ['301 Moved Permanently', 'URL mudou permanentemente'],
          ['304 Not Modified', 'Use o cache, nada mudou'],
          ['400 Bad Request', 'Dados inválidos enviados'],
          ['401 Unauthorized', 'Não autenticado (sem token)'],
          ['403 Forbidden', 'Autenticado, mas sem permissão'],
          ['404 Not Found', 'Recurso não existe'],
          ['409 Conflict', 'Conflito (ex: email duplicado)'],
          ['422 Unprocessable', 'Dados não processáveis (validação)'],
          ['429 Too Many Requests', 'Rate limit atingido'],
          ['500 Internal Server Error', 'Erro genérico do servidor'],
          ['502 Bad Gateway', 'Proxy/gateway com problema'],
          ['503 Service Unavailable', 'Servidor fora do ar'],
        ],
      },
      {
        type: 'quiz',
        question: 'Você tenta acessar um endpoint com um token expirado. Qual status code é mais correto?',
        options: ['400 Bad Request', '401 Unauthorized', '403 Forbidden', '404 Not Found'],
        answer: 1,
        explanation: '401 Unauthorized indica que a autenticação falhou ou não foi fornecida. 403 Forbidden seria quando você está autenticado mas não tem permissão. Token expirado = sem autenticação válida = 401.',
      },
    ],
  },

  {
    id: 4,
    title: '📋 Headers HTTP',
    category: 'Headers',
    content: [
      {
        type: 'text',
        text: `Headers são metadados da requisição/resposta — informações sobre o conteúdo, quem está enviando, formatos aceitos, autenticação, etc.

Headers ficam no início da mensagem HTTP, antes do body.`,
      },
      {
        type: 'example',
        label: 'Headers de requisição mais comuns:',
        code: `Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
Content-Type: application/json
Accept: application/json
User-Agent: MinicUrl/1.0
X-Request-ID: abc-123-def`,
      },
      {
        type: 'example',
        label: 'Como enviar headers com cURL:',
        code: `# Um header
curl https://api.exemplo.com \\
  -H "Authorization: Bearer meu-token"

# Múltiplos headers
curl https://api.exemplo.com \\
  -H "Authorization: Bearer meu-token" \\
  -H "Content-Type: application/json" \\
  -H "Accept-Language: pt-BR"`,
      },
      {
        type: 'concept',
        label: 'Content-Type vs Accept',
        text: `Content-Type: informa o formato do body que você ESTÁ enviando
Accept: informa o formato que você QUER receber como resposta

Exemplo: envio JSON, quero receber JSON:
  Content-Type: application/json
  Accept: application/json`,
      },
      {
        type: 'practice',
        description: 'Vamos fazer uma requisição real com headers customizados!',
        url: 'https://httpbin.org/headers',
        method: 'GET',
        headers: { 'X-MinicUrl-Test': 'aprendendo', 'X-Custom': 'valor123' },
        tip: 'O httpbin.org retorna os headers que você enviou — ótimo para testar!',
      },
    ],
  },

  {
    id: 5,
    title: '🔐 Autenticação HTTP',
    category: 'Segurança',
    content: [
      {
        type: 'text',
        text: `Existem vários mecanismos de autenticação em APIs HTTP. Os principais:`,
      },
      {
        type: 'concept',
        label: '1. Bearer Token (JWT)',
        text: `O mais comum em APIs modernas. Um token (geralmente JWT) é enviado no header:
Authorization: Bearer <token>

O token contém claims (informações) codificadas em Base64.
  curl -H "Authorization: Bearer eyJ0eXAi..." https://api.ex.com/me`,
      },
      {
        type: 'concept',
        label: '2. Basic Auth',
        text: `Usuário e senha codificados em Base64:
Authorization: Basic dXN1YXJpbzpzZW5oYQ==

  curl -u usuario:senha https://api.ex.com
  curl -H "Authorization: Basic dXN1YXJpbzpzZW5oYQ==" https://api.ex.com`,
      },
      {
        type: 'concept',
        label: '3. API Key',
        text: `Uma chave única enviada como header ou query param:
X-API-Key: minha-chave-secreta
  ou
https://api.ex.com/data?api_key=minha-chave

  curl -H "X-API-Key: minha-chave" https://api.ex.com`,
      },
      {
        type: 'concept',
        label: '4. OAuth 2.0',
        text: `Fluxo mais complexo para autorização delegada (login com Google, GitHub, etc).
Primeiro você obtém um access_token, depois usa como Bearer.`,
      },
      {
        type: 'quiz',
        question: 'Qual a forma MAIS segura de enviar credenciais?',
        options: [
          'Query params (?api_key=...)',
          'Header Authorization com HTTPS',
          'Body JSON',
          'Cookie não-httponly',
        ],
        answer: 1,
        explanation: 'Headers com HTTPS são seguros pois o HTTPS criptografa toda a comunicação incluindo headers. Query params ficam em logs de servidor, URLs de browser history — menos seguros.',
      },
    ],
  },

  {
    id: 6,
    title: '📦 Body e Content-Type',
    category: 'Body',
    content: [
      {
        type: 'text',
        text: `O body é o "corpo" da mensagem — os dados que você envia (POST/PUT/PATCH).
O Content-Type diz ao servidor como interpretar esses dados.`,
      },
      {
        type: 'example',
        label: 'JSON (mais comum em APIs REST):',
        code: `curl -X POST https://api.exemplo.com/users \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Maria",
    "email": "maria@email.com",
    "age": 28
  }'`,
      },
      {
        type: 'example',
        label: 'Form URL-Encoded (formulários HTML tradicionais):',
        code: `curl -X POST https://api.exemplo.com/login \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "username=maria&password=senha123"

# Atalho no cURL (define Content-Type automaticamente):
curl -X POST https://api.exemplo.com/login \\
  --data-urlencode "username=maria" \\
  --data-urlencode "password=senha com espaço"`,
      },
      {
        type: 'example',
        label: 'Multipart Form (upload de arquivos):',
        code: `curl -X POST https://api.exemplo.com/upload \\
  -F "file=@/caminho/do/arquivo.pdf" \\
  -F "description=Meu documento"`,
      },
      {
        type: 'practice',
        description: 'Vamos enviar um POST com JSON!',
        url: 'https://httpbin.org/post',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { name: 'Estudante MinicUrl', topic: 'HTTP', level: 'aprendendo' },
        tip: 'O httpbin.org retorna exatamente o que você enviou — ótimo para ver como o servidor recebe seus dados.',
      },
    ],
  },
];

// ─────────────────────────────────────────────
//  LEARNING MODULE
// ─────────────────────────────────────────────
export class LearningModule {
  async startInteractive(COLORS, inquirer, boxen) {
    console.log('\n' + COLORS.info('  📚 cURL ACADEMY') + '\n');
    console.log(COLORS.muted('  Aprenda HTTP e cURL de forma interativa com exemplos reais.\n'));

    let inAcademy = true;
    while (inAcademy) {
      const choices = LESSONS.map(l => ({
        name: `${l.title} ${COLORS.dim('— ' + l.category)}`,
        value: l.id,
      }));
      choices.push(new inquirer.Separator());
      choices.push({ name: COLORS.dim('↩  Voltar ao menu principal'), value: 'back' });

      const { lessonId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'lessonId',
          message: 'Escolha uma lição:',
          prefix: COLORS.accent('  ◈'),
          choices,
          pageSize: 12,
        },
      ]);

      if (lessonId === 'back') {
        inAcademy = false;
      } else {
        const lesson = LESSONS.find(l => l.id === lessonId);
        await this.displayLesson(lesson, COLORS, inquirer, boxen);
      }
    }
  }

  async displayLesson(lesson, COLORS, inquirer, boxen) {
    console.clear();
    console.log('\n' + COLORS.primary('  ╔══════════════════════════════════╗'));
    console.log(COLORS.primary('  ║  ') + COLORS.white(lesson.title.padEnd(34)) + COLORS.primary('  ║'));
    console.log(COLORS.primary('  ╚══════════════════════════════════╝') + '\n');

    for (const block of lesson.content) {
      switch (block.type) {
        case 'text':
          console.log(block.text.split('\n').map(l => '  ' + COLORS.white(l)).join('\n'));
          console.log();
          break;

        case 'example':
          console.log('  ' + COLORS.info('▸ ' + block.label));
          console.log(boxen(
            block.code.split('\n').map(l => COLORS.success(l)).join('\n'),
            { padding: { top: 0, bottom: 0, left: 2, right: 2 }, margin: { left: 2 }, borderStyle: 'round', borderColor: '#39FF14', dimBorder: true }
          ));
          break;

        case 'concept':
          console.log(boxen(
            COLORS.warning('  ' + block.label + '\n') +
            block.text.split('\n').map(l => COLORS.muted(l)).join('\n'),
            { padding: 1, margin: { left: 2 }, borderStyle: 'single', borderColor: '#FFD700' }
          ));
          break;

        case 'table':
          console.log('  ' + COLORS.info('▸ ' + block.label));
          for (const [code, desc] of block.rows) {
            console.log('    ' + COLORS.primary(code.padEnd(25)) + COLORS.muted(desc));
          }
          console.log();
          break;

        case 'quiz':
          await this.runQuiz(block, COLORS, inquirer);
          break;

        case 'practice':
          await this.runPractice(block, COLORS, inquirer);
          break;
      }

      await this.pressEnter(COLORS, inquirer);
    }

    console.log(COLORS.success('\n  ✓ Lição concluída!\n'));
  }

  async runQuiz(block, COLORS, inquirer) {
    console.log('\n' + boxen(
      COLORS.warning('  📝 QUIZ\n\n') +
      COLORS.white('  ' + block.question),
      { padding: 1, margin: { left: 2 }, borderStyle: 'double', borderColor: '#FFD700' }
    ));

    const { answer } = await inquirer.prompt([
      {
        type: 'list',
        name: 'answer',
        message: 'Sua resposta:',
        prefix: COLORS.accent('  ◈'),
        choices: block.options.map((o, i) => ({ name: o, value: i })),
      },
    ]);

    if (answer === block.answer) {
      console.log(COLORS.success('\n  ✓ Correto!\n'));
    } else {
      console.log(COLORS.error('\n  ✗ Não exatamente...\n'));
    }
    console.log('  ' + COLORS.info('💡 Explicação: ') + COLORS.muted(block.explanation) + '\n');
  }

  async runPractice(block, COLORS, inquirer) {
    console.log('\n' + COLORS.warning('  🔬 PRÁTICA REAL') + '\n');
    console.log('  ' + COLORS.muted(block.tip));
    console.log('  ' + COLORS.dim('Vamos fazer: ') + COLORS.primary(block.method + ' ' + block.url) + '\n');

    const { doPractice } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'doPractice',
        message: 'Executar esta requisição de exemplo?',
        prefix: COLORS.accent('  ◈'),
        default: true,
      },
    ]);

    if (doPractice) {
      try {
        const result = await engine.request({
          method: block.method,
          url: block.url,
          headers: block.headers || {},
          body: block.body || null,
        });

        const statusColor = result.status < 400
          ? COLORS.success(String(result.status))
          : COLORS.error(String(result.status));

        console.log('\n  ' + COLORS.dim('Status: ') + statusColor + COLORS.dim(` | ${result.duration}ms`));

        if (result.data) {
          const preview = JSON.stringify(result.data, null, 2).split('\n').slice(0, 10).join('\n');
          console.log(COLORS.dim('  Resposta (prévia):\n') +
            preview.split('\n').map(l => '    ' + COLORS.muted(l)).join('\n'));
        }
      } catch (err) {
        console.log(COLORS.error(`  ✗ Erro: ${err.message}`));
      }
      console.log();
    }
  }

  async pressEnter(COLORS, inquirer) {
    await inquirer.prompt([
      {
        type: 'input',
        name: '_',
        message: COLORS.dim('Pressione Enter para continuar...'),
        prefix: '',
      },
    ]);
  }
}
