# Paperclip GitHub Manager v2 — Design Spec

## Objetivo

Reescrever o plugin `paperclip-github-manager` (atualmente v0.4.0) para resolver problemas de performance, adicionar integração profunda com cards do Paperclip, review hierárquica por agentes, e visualização de repositórios via graphify. Tudo self-contained no ecossistema Paperclip — sem serviços externos.

## Contexto

O plugin atual sofre de:
- **Lentidão na UI**: páginas de config e repos fazem fetch direto ao GitHub na renderização
- **Sync insuficiente**: cron de 6h deixa dados desatualizados
- **Sem integração com cards**: PRs não aparecem dentro dos cards/issues
- **Sem graphify**: repositórios não têm visualização de knowledge graph

## Decisões de Design

- **Persistência local via DB do SDK** (`database.migrationsDir`) — UI nunca chama GitHub na renderização
- **Sync em 3 camadas**: webhook (tempo real) + cron curto (5min) + full sync manual
- **Vínculo PR↔Card**: automático (webhook + pattern matching) + manual (fallback)
- **Review hierárquica**: usuário escolhe qual agente revisa (agente do card ou agente superior)
- **Graphify**: sob demanda, 2 níveis (alto nível cross-repo + código interno por repo)
- **Distribuição**: npm público, qualquer instância Paperclip pode instalar

---

## 1. Persistência — DB Local

O plugin declara `database: { migrationsDir: "migrations" }` no manifest. Todas as tabelas são automaticamente scoped por company pelo SDK.

### Tabelas

```sql
-- Repositórios rastreados
CREATE TABLE gh_repositories (
  id            INTEGER PRIMARY KEY,
  full_name     TEXT NOT NULL UNIQUE,
  owner         TEXT NOT NULL,
  name          TEXT NOT NULL,
  private       BOOLEAN NOT NULL DEFAULT false,
  default_branch TEXT NOT NULL DEFAULT 'main',
  html_url      TEXT NOT NULL,
  description   TEXT,
  language      TEXT,
  topics        TEXT, -- JSON array
  updated_at    TEXT NOT NULL,
  synced_at     TEXT NOT NULL
);

-- Pull Requests
CREATE TABLE gh_pull_requests (
  id            INTEGER PRIMARY KEY,
  repo_id       INTEGER NOT NULL REFERENCES gh_repositories(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  state         TEXT NOT NULL, -- open, closed, merged
  author        TEXT NOT NULL,
  head_branch   TEXT NOT NULL,
  base_branch   TEXT NOT NULL,
  html_url      TEXT NOT NULL,
  draft         BOOLEAN NOT NULL DEFAULT false,
  mergeable     BOOLEAN,
  merged_at     TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  synced_at     TEXT NOT NULL,
  UNIQUE(repo_id, number)
);

-- Issues
CREATE TABLE gh_issues (
  id            INTEGER PRIMARY KEY,
  repo_id       INTEGER NOT NULL REFERENCES gh_repositories(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  state         TEXT NOT NULL,
  author        TEXT NOT NULL,
  labels        TEXT, -- JSON array
  html_url      TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  synced_at     TEXT NOT NULL,
  UNIQUE(repo_id, number)
);

-- Vínculo PR ↔ Card (issue do Paperclip)
CREATE TABLE gh_pr_card_links (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id         INTEGER NOT NULL REFERENCES gh_pull_requests(id) ON DELETE CASCADE,
  issue_id      TEXT NOT NULL, -- ID do card/issue no Paperclip
  link_source   TEXT NOT NULL CHECK(link_source IN ('webhook', 'pattern', 'manual')),
  created_at    TEXT NOT NULL,
  UNIQUE(pr_id, issue_id)
);

-- Log de sincronizações
CREATE TABLE gh_sync_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  scope         TEXT NOT NULL CHECK(scope IN ('full', 'incremental', 'webhook')),
  repos_synced  INTEGER NOT NULL DEFAULT 0,
  prs_synced    INTEGER NOT NULL DEFAULT 0,
  issues_synced INTEGER NOT NULL DEFAULT 0,
  errors        TEXT, -- JSON array
  started_at    TEXT NOT NULL,
  finished_at   TEXT
);
```

---

## 2. Sync Inteligente — 3 Camadas

### Camada 1 — Webhook (tempo real)

O GitHub envia eventos `pull_request` e `issues` para o endpoint do plugin.

Handler:
1. Faz upsert no DB local do PR/issue recebido
2. Tenta auto-vincular PR↔Card via pattern matching no branch/título
3. Emite evento interno `github.pr.updated` para a UI reagir

### Camada 2 — Cron curto (safety net, a cada 5 min)

Job scheduled que faz sync incremental:
- Busca apenas items com `updated_at > last_sync` por repo
- Paginação com `per_page=100` + `since` parameter da API do GitHub
- Atualiza DB local, marca `synced_at`
- Recupera dados perdidos se webhook falhar ou Paperclip reiniciar

### Camada 3 — Full sync manual

Botão na UI de settings para forçar re-sync completo. Útil no setup inicial ou troubleshooting.

### Rate limiting

- Respeita `X-RateLimit-Remaining` do GitHub
- Se < 100 requests restantes, reduz scope do sync (pula repos sem atividade recente)
- Erros logados no `gh_sync_log`

---

## 3. Vínculo PR ↔ Card

### Auto-detecção (3 estratégias em cascata)

1. **Webhook origin** — quando o agente do Paperclip cria o PR, o plugin registra o vínculo imediatamente (`link_source = 'webhook'`)
2. **Pattern matching** — regex no branch name e título do PR procurando IDs de cards. Roda no webhook e no cron (`link_source = 'pattern'`)
3. **Manual** — usuário seleciona o PR de um dropdown dentro do card (`link_source = 'manual'`)

### Detail Tab no Card (`detailTab` UI slot)

Quando o card tem PRs vinculados, a aba "GitHub" aparece:

- Status do PR (open/draft/merged/closed) com badge colorido
- Branch, autor, tempo desde última atualização
- Link direto para o GitHub
- Botão **"Revisar"** com dropdown para escolher reviewer:
  - Agente do card
  - Agente superior (managed agents com role de review)
- Botão **"Vincular PR"** para associação manual
- Resumo da última review (veredicto + contagem de comentários)

Quando não há PRs vinculados: estado vazio com botão "Vincular PR".

---

## 4. Review Hierárquica — Agentes

### Managed Agent

O plugin declara um agente de review no manifest:

```ts
agents: [{
  agentKey: "github-reviewer",
  displayName: "GitHub Code Reviewer",
  role: "code-review",
  title: "Senior Code Reviewer",
}]
```

Operadores podem criar agentes adicionais (ex: "CTO", "Security Reviewer"). O plugin lista todos os disponíveis no dropdown de review.

### Fluxo de Review

1. Usuário clica "Revisar" no detail tab → escolhe agente
2. Plugin chama `ctx.agents.invoke()` com o agente escolhido
3. Agente recebe as tools:
   - `github_get_pull_request_diff` — diff do PR
   - `github_read_file_content` — contexto de arquivos
   - `github_create_review_comment` — comentário inline no GitHub
   - `github_submit_pr_review` — veredicto final (APPROVE / REQUEST_CHANGES / COMMENT)
4. Resultado aparece em 3 lugares:
   - **Detail tab do card** — resumo com veredicto
   - **GitHub** — review comments no PR
   - **Chat do card** — análise completa do agente

### Review Automática Leve (webhook)

Quando um PR é aberto/atualizado, checklist rápido sem intervenção:
- PR tem descrição? Testes? Arquivos sensíveis alterados?
- Resultado salvo no DB, visível no detail tab como "Quick Check"
- Sem postagem automática no GitHub — apenas flags internos

---

## 5. Graphify — Knowledge Graph dos Repos

### Acionamento

**Context menu no repo** (`contextMenuItem` UI slot):
- Botão direito no repo → "Gerar Knowledge Graph"
- Plugin lê conteúdo do repo via API do GitHub
- Graphify gera o grafo
- Resultado salvo e acessível na página de grafos

### Página de Grafos (`page` UI slot, rota `/github-graphs`)

- Lista todos os grafos gerados
- Visualização interativa (HTML)
- Filtros: por repo, por tipo
- Botão "Regenerar"

### Dois Níveis de Grafo

1. **Alto nível** — relação entre repos, PRs abertos entre eles, dependências cross-repo, quais agentes atuam em cada repo
2. **Código interno** — classes, módulos, imports, dependências de pacotes dentro de um repo (drill-down)

### Atualização

- Manual sob demanda (botão "Regenerar")
- Não automático — gerar grafos é pesado em tokens/API calls

---

## 6. UI — Páginas e Navegação

### Páginas

| Página | Rota | Conteúdo |
|--------|------|----------|
| Settings | `/github-settings` | Token, repos rastreados, config de sync, config de review automática |
| Repositórios | `/github-repos` | Lista de repos do DB local, status de sync, ações (webhook, graphify) |
| Pull Requests | `/github-prs` | Todos os PRs com filtros (repo, status, autor, vinculado a card?) |
| Knowledge Graphs | `/github-graphs` | Grafos gerados pelo graphify, visualização interativa |
| Detail Tab | (dentro do card) | PRs vinculados, botão review, resumo de reviews |

### Performance

- Todas as páginas leem do DB local — renderização instantânea
- Indicador de "última sincronização" visível em cada página
- Botão de sync manual acessível de qualquer página
- Loading states apenas durante ações (sync, review, gerar grafo)

### Dashboard Widget

- Status: autenticado? último sync? erros?
- Contadores: X PRs abertos, Y issues, Z repos rastreados
- Link rápido para PRs que precisam de atenção

### Sidebar

- Navegação entre as 4 páginas
- Badge com contagem de PRs abertos

---

## 7. Manifest — Capabilities

```ts
capabilities: [
  "config",
  "events.subscribe",
  "events.emit",
  "http.request",
  "secrets.resolve",
  "state.read",
  "state.write",
  "database.query",
  "database.mutate",
  "jobs.schedule",
  "webhooks.receive",
  "tools.register",
  "agents.managed.reconcile",
  "agents.invoke",
  "issues.read",
  "ui.page.register",
  "ui.sidebar.register",
  "ui.detailTab.register",
  "ui.dashboardWidget.register",
  "ui.contextMenuItem.register",
  "logging",
]
```

---

## 8. Estrutura de Arquivos do Plugin

```
src/
  manifest.ts              — declaração do plugin
  worker.ts                — setup, eventos, jobs, data/actions
  db/
    migrations/
      001_initial.sql      — tabelas iniciais
    queries.ts             — queries tipadas para o DB
  sync/
    webhook-handler.ts     — handler de webhooks do GitHub
    incremental-sync.ts    — sync cron a cada 5min
    full-sync.ts           — sync completo manual
    link-detector.ts       — pattern matching PR↔Card
  github/
    api-client.ts          — fetch autenticado + rate limiting
    config.ts              — resolução de token
  review/
    review-tools.ts        — tools expostas aos agentes
    quick-check.ts         — checklist automático leve
  graphify/
    graph-generator.ts     — integração com graphify
  ui/
    index.tsx              — exports de todos os componentes UI
    components/
      SettingsPage.tsx
      ReposPage.tsx
      PullRequestsPage.tsx
      GraphsPage.tsx
      DetailTab.tsx        — aba GitHub dentro do card
      DashboardWidget.tsx
      Sidebar.tsx
      ReviewDropdown.tsx
tests/
  sync.test.ts
  link-detector.test.ts
  review-tools.test.ts
  queries.test.ts
```
