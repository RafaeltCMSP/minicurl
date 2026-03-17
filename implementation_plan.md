# Módulo de IA com Ollama — Plano de Implementação

## Objetivo

Adicionar ao **MinicUrl** um sistema completo de agentes de IA integrado ao **Ollama local**, sem adicionar nenhuma dependência npm. Todo controle de credenciais e configuração ocorre dentro do próprio CLI.

---

## Arquitetura

```
src/ai/
├── config.js           ← ConfigManager (salva URL, modelo, API key em ~/.minicurl-ai.json)
├── ollamaClient.js     ← Cliente HTTP nativo p/ Ollama (streaming + sync)
├── agentBus.js         ← Barramento de mensagens entre agentes
└── agents/
    ├── orchestrator.js ← Orquestrador (conversa com user, decide qual agente chamar)
    ├── requestAgent.js ← Agente de Requisições HTTP (gera cURL, analisa requests)
    ├── testAgent.js    ← Agente de Testes (cria suites JSON automaticamente)
    ├── explainAgent.js ← Agente Explicador (documenta respostas HTTP)
    └── debugAgent.js   ← Agente Debugger (analisa erros, sugere correções)

src/ui/
└── aiChat.js           ← Interface de chat TUI com streaming de tokens
```

---

## Proposed Changes

### `src/ai/config.js` — ConfigManager [NEW]
Persiste configurações em `~/.minicurl-ai.json`:
- `ollamaUrl`: URL base do Ollama (default: `http://localhost:11434`)
- `model`: modelo ativo (ex: `llama3`, `mistral`, `codellama`)
- `apiKey`: api key opcional (para Ollama protegido ou OpenAI-compat)
- `streaming`: boolean
- Métodos: [get()](file:///d:/Paragon/minicurl/src/ui/tui.js#515-527), [set(key, val)](file:///d:/Paragon/minicurl/src/ui/tui.js#606-631), `reset()`, `showConfig()`

---

### `src/ai/ollamaClient.js` — Cliente Ollama [NEW]
Comunicação via `http` nativo do Node, sem dependências:
- `chat(messages, model, stream)` → streaming de tokens ou resposta única
- `listModels()` → lista modelos disponíveis localmente
- `checkConnection()` → verifica se Ollama está online
- `generate(prompt, model, stream)` → geração rápida

---

### `src/ai/agentBus.js` — Barramento de Agentes [NEW]
- `emit(event, payload)` → dispara evento para agente correto
- [on(event, handler)](file:///d:/Paragon/minicurl/src/core/engine.js#11-17) → registra handlers
- `route(intent)` → roteamento por intenção detectada pelo orquestrador
- Mantém contexto de conversa compartilhado entre agentes

---

### `src/ai/agents/orchestrator.js` — Orquestrador [NEW]
O único agente que fala diretamente com o usuário:
- Mantém histórico de conversa (`messages[]`)
- **Detecta intenção**: requisição HTTP, teste, explicação, debug
- **Roteia**: chama o agente especialista correto via AgentBus
- **Consolida**: retorna resposta final ao usuário
- System prompt especializado em HTTP/cURL/APIs

---

### `src/ai/agents/requestAgent.js` — Agente de Requisições [NEW]
- Gera requisições HTTP a partir de descrição em linguagem natural
- Converte para cURL, pode executar via [RequestEngine](file:///d:/Paragon/minicurl/src/core/engine.js#10-133)
- Analisa resposta e retorna insights
- Input: `{ userMessage, context }` → Output: `{ curl, result, analysis }`

---

### `src/ai/agents/testAgent.js` — Agente de Testes [NEW]
- Gera suites de teste JSON (formato existente do [testRunner.js](file:///d:/Paragon/minicurl/src/core/testRunner.js))
- A partir de uma URL/API, cria casos de teste automaticamente
- Pode rodar os testes e reportar resultados
- Input: `{ apiDescription, baseUrl }` → Output: `suite.json`

---

### `src/ai/agents/explainAgent.js` — Agente Explicador [NEW]
- Recebe resultado de uma requisição HTTP
- Retorna explicação didática: status code, headers, body, performance
- Modo "academy": ensina conceitos HTTP relacionados
- Input: `{ result, method, url }` → Output: `explanation string`

---

### `src/ai/agents/debugAgent.js` — Agente Debugger [NEW]
- Analisa erros de requisição (ECONNREFUSED, 401, 500, etc.)
- Sugere correções com exemplos concretos
- Pode testar variações da requisição automaticamente
- Input: `{ error, request }` → Output: `{ diagnosis, suggestions, fixedRequest? }`

---

### `src/ui/aiChat.js` — Interface de Chat com IA [NEW]
- Interface `inquirer`-based com streaming de tokens no terminal
- Exibe spinner enquanto aguarda resposta
- Mostra qual agente está sendo ativado
- Permite sair, limpar histórico, trocar modelo
- Comandos especiais: `/clear`, `/model`, `/config`, `/help`

---

### Modificações em arquivos existentes

#### [MODIFY] [tui.js](file:///d:/Paragon/minicurl/src/ui/tui.js)
- Adiciona item "🤖 AI Assistant" no [mainMenu()](file:///d:/Paragon/minicurl/src/ui/tui.js#120-172)
- Chama `aiChat.js` quando selecionado

#### [MODIFY] [cli.js](file:///d:/Paragon/minicurl/src/cli.js)
- Adiciona subcomando [ai](file:///d:/Paragon/minicurl/src/ui/tui.js#120-172) com suporte a: `ai <prompt>`, `ai config`, `ai analyze <url>`

#### [MODIFY] [bin/minicurl.js](file:///d:/Paragon/minicurl/bin/minicurl.js)
- Detecta `args[0] === 'ai'` e roteia para módulo de IA

#### [MODIFY] [package.json](file:///d:/Paragon/minicurl/package.json)
- Nenhuma nova dependência (usa apenas `http` nativo + libs já existentes)

---

## Configuração via CLI

```bash
# Configurar URL do Ollama
minicurl ai config --url http://localhost:11434

# Configurar modelo
minicurl ai config --model llama3

# Configurar API Key (opcional)
minicurl ai config --key minha-api-key

# Ver configuração atual
minicurl ai config --show

# Resetar configuração
minicurl ai config --reset
```

---

## Verification Plan

### Automated Tests (via terminal)

```bash
# 1. Verificar se o módulo carrega sem erro
node -e "import('./src/ai/config.js').then(m => console.log('✓ config OK'))"

# 2. Verificar cliente Ollama (requer Ollama rodando)
node -e "import('./src/ai/ollamaClient.js').then(async m => { const ok = await m.OllamaClient.create().checkConnection(); console.log('Ollama:', ok ? '✓ Online' : '✗ Offline') })"

# 3. Testar CLI direto
node bin/minicurl.js ai config --show
node bin/minicurl.js ai config --url http://localhost:11434 --model llama3
node bin/minicurl.js ai "Como faço um GET em https://httpbin.org/get?"
```

### Manual Verification

1. Rodar `node bin/minicurl.js` (sem args) → deve aparecer "🤖 AI Assistant" no menu
2. Selecionar "AI Assistant" → deve abrir interface de chat
3. Digitar "Crie um POST para https://httpbin.org/post com JSON {name: test}" → IA deve gerar o cURL e executar
4. Digitar "analise o resultado" → agente explicador deve descrever a resposta
5. Digitar `/config` no chat → deve mostrar configuração atual
6. Digitar `/model mistral` → deve trocar modelo
