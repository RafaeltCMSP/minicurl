# 🌐 MinicUrl

> HTTP Client · cURL Academy · API Test Runner — tudo no seu terminal

---

## ✨ Recursos

| Recurso | Descrição |
|--------|-----------|
| 🎨 **TUI Animado** | Interface interativa com splash screen animado e menus coloridos |
| ⚡ **Requisições HTTP** | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS com suporte a JSON, Form, Multipart |
| 🔐 **Autenticação** | Bearer Token, Basic Auth, API Key |
| 📚 **cURL Academy** | 6 lições interativas de HTTP com quizzes e prática real |
| 🧪 **Test Runner** | Execute suites de testes para suas APIs com assertions avançadas |
| 📜 **Histórico** | Persistência local de todas as requisições com re-execução |
| 📦 **Collections** | Organize suas requisições favoritas |
| 💡 **cURL Converter** | Converte qualquer requisição para o comando cURL equivalente |
| 🎯 **CLI Direto** | Modo não-interativo para scripts e automação |

---

## 🚀 Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/minicurl.git
cd minicurl

# 2. Instale as dependências
npm install

# 3. Instale globalmente
npm install -g .
```

Pronto! Agora você pode usar `minicurl` de qualquer lugar.

---

## 🎮 Como Usar

### Modo Interativo (TUI)
```bash
minicurl
```
Abre a interface animada com menus coloridos.

### Modo CLI Direto
```bash
# GET simples
minicurl get https://api.github.com/users/octocat

# POST com JSON
minicurl post https://httpbin.org/post \
  -H "Content-Type: application/json" \
  -d '{"name":"Teste","value":42}'

# Com autenticação
minicurl get https://api.exemplo.com/me \
  -H "Authorization: Bearer meu-token"

# Salvar resposta
minicurl get https://api.exemplo.com/data -o resultado.json

# Verbose (mostra detalhes)
minicurl get https://httpbin.org/get -v

# Ver cURL equivalente
minicurl post https://api.com/users -d '{"x":1}' --curl
```

---

## 🧪 API Test Runner

Crie um arquivo `suite.json`:

```json
{
  "name": "Minha Suite de Testes",
  "tests": [
    {
      "name": "GET /users retorna 200",
      "method": "GET",
      "url": "https://jsonplaceholder.typicode.com/users",
      "assertions": [
        { "type": "status", "expected": 200 },
        { "type": "response_time", "expected": 1000 },
        { "type": "header_exists", "expected": "content-type" }
      ]
    },
    {
      "name": "POST cria post",
      "method": "POST",
      "url": "https://jsonplaceholder.typicode.com/posts",
      "body": { "title": "Teste", "userId": 1 },
      "assertions": [
        { "type": "status", "expected": 201 },
        { "type": "body_contains", "expected": "Teste" },
        { "type": "json_path", "path": "id", "operator": "exists" }
      ]
    }
  ]
}
```

Execute via TUI → 🧪 API Test Runner → Carregar suite.

---

## 📋 Tipos de Assertions

| Tipo | Parâmetros | Descrição |
|------|-----------|-----------|
| `status` | `expected: 200` | Status code exato |
| `status_range` | `expected: [200, 299]` | Status em intervalo |
| `header_exists` | `expected: "content-type"` | Header presente |
| `header_equals` | `header: "x-api"`, `expected: "v1"` | Valor de header |
| `body_contains` | `expected: "texto"` | Body contém texto |
| `json_path` | `path: "data.id"`, `operator: "exists"` | JSON path |
| `response_time` | `expected: 1000` | Tempo máximo (ms) |

---

## 📚 cURL Academy — Lições

1. 🌐 **O que é HTTP?** — Fundamentos do protocolo
2. ⚡ **Métodos HTTP** — GET, POST, PUT, PATCH, DELETE e idempotência
3. 📊 **Status Codes** — Família 2xx, 4xx, 5xx e mais
4. 📋 **Headers HTTP** — Content-Type, Authorization, Accept...
5. 🔐 **Autenticação** — Bearer, Basic Auth, API Key, OAuth 2.0
6. 📦 **Body e Content-Type** — JSON, Form, Multipart

Cada lição tem exemplos reais de cURL, conceitos e um quiz!

---

## 📁 Estrutura do Projeto

```
minicurl/
├── bin/
│   └── minicurl.js          # Entry point executável
├── src/
│   ├── cli.js               # Modo CLI direto
│   ├── core/
│   │   ├── engine.js        # Motor HTTP
│   │   ├── history.js       # Gerenciador de histórico
│   │   └── testRunner.js    # Test runner
│   ├── learn/
│   │   └── academy.js       # Módulo de aprendizado
│   └── ui/
│       ├── tui.js           # Interface interativa
│       └── display.js       # Renderização de resultados
├── package.json
└── README.md
```

---

## 🗂 Dados Locais

O MinicUrl salva dados em `~/.minicurl/`:
- `history.json` — histórico de requisições (últimas 500)

---

## 💡 Dicas

- Use `https://httpbin.org` para testar suas requisições — ele retorna tudo que você enviou
- Use `--curl` para gerar o comando cURL e compartilhar com colegas
- Na Academy, as lições de prática fazem requisições reais!
- O Test Runner é perfeito para CI/CD e validação rápida de APIs

---

*Feito com ❤️ para aprender e testar APIs*
