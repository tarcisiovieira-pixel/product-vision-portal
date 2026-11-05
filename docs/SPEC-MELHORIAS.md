# ARES Mobility — Auditoria e Spec de Melhorias

Data: 2026-11-04 · Branch: `main` · Escopo: segurança, build/qualidade, arquitetura, estilização/UX, testes.
Método: leitura de código + execução de `tsc`, `eslint`, `vitest`, `vite build`. Nenhum arquivo do app foi alterado.

## 1. Estado atual (medido)

| Verificação | Resultado |
|---|---|
| `vite build` | ✅ passa |
| `vitest run` | ✅ 11 arquivos / 46 testes (com ruído de `canvas.getContext` do jsdom) |
| `tsc --noEmit` | ❌ **115 erros** (strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`) |
| `eslint .` | ❌ **6.560 erros** — 1.294 são prettier real; o resto é CRLF vs LF. Reais: 59 `no-explicit-any`, 5 `rules-of-hooks`, 7 `no-empty`, 7 `react-refresh` |
| Working tree | ⚠️ **48 arquivos não commitados** (~4.800 linhas alteradas + muitos novos). Risco alto de perda e impossível de reverter por partes |
| Maiores arquivos | `FlightChaseViewer3D` 1.644 · `BookingWizardModal` 1.099 · `my-rentals` 1.057 · `VehicleModel` 874 · `booking` 836 · `RadarGlobe` 806 |
| Maior chunk client | `constants-*.js` 915 kB (provável three/drei) |

> `rules-of-hooks` (5) são bugs potenciais de runtime, não estilo. Prioridade sobre o resto do lint.

## 2. Achados — por severidade

### 🔴 Crítico (corrigir antes de qualquer deploy)

**S1. `.env` está versionado** (`git ls-files` lista `.env`) e `.gitignore` não o cobre. Contém URL/ID/chave publishable do Supabase. A chave publishable é pública por design, então o dano é baixo *hoje*, mas o padrão é perigoso: o próximo segredo (ex.: service role) entra no git sem aviso.
→ Adicionar `.env*` ao `.gitignore`, `git rm --cached .env`, criar `.env.example`. **Não reescrever histórico** (ver restrição Lovable em `AGENTS.md`); como a chave é publishable, não precisa rotacionar.

**S2. Backend Express (`server/app.ts`) tem credenciais hardcoded e fallback para service role.**
- Linhas 15–16: URL e chave publishable embutidas como default.
- `SUPABASE_KEY = SERVICE_ROLE_KEY || PUBLISHABLE…` — se alguém definir a service role no ambiente, **todas** as rotas passam a ignorar RLS, e nenhuma rota valida o usuário.
- `GET /api/rentals`, `POST /:id/extend`, `/:id/cancel`, `/maintenance/service` **não exigem autenticação**; qualquer cliente lê/altera reservas de todos.
- `/api/auth/login` aceita `demo@aresmobility.com` com falha de senha e devolve um token fixo (`demo-jwt-martian-token-validated`) que `/auth/verify` aceita. É um bypass de auth embutido.
- `POST /rentals/book` usa `user_id: "demo-commander-ares"` fixo e cai em fallback em memória quando o RPC falha, **mascarando erros reais** como sucesso (HTTP 201). Preço calculado no servidor mas só do catálogo em memória, não do banco.
- `user_license` vem do **body** (cliente decide a própria habilitação).
- Preço/extras ficam duplicados entre front, backend e SQL — três fontes de verdade.

**Importante: o front não chama esse backend** (nenhuma referência a `/api/` em `src/` fora de testes). Ele é código paralelo, não está no caminho de produção.
→ Decisão necessária (ver §6): remover, ou promover a BFF real com auth. Até lá, não expor `npm run backend` fora de localhost.

**S3. "Sessão demo" é só `localStorage`** (`ares_demo_session`) e `app.tsx`/`login.tsx` a aceitam como autenticação. Qualquer pessoa entra em `/app/*` setando uma chave no console. Aceitável se `/app` só mostra dados seed; **inaceitável** se algum dia misturar com dados reais. Hoje a rota `/app` é `ssr:false`, então a proteção é só visual.
→ Isolar o modo demo (flag `VITE_DEMO_MODE`, desligada em produção) e garantir que dados reais só venham de queries com sessão Supabase válida.

### 🟠 Alto — RLS / Banco (`supabase/migrations`)

- **`record_flight_telemetry`** é `SECURITY DEFINER`, `GRANT EXECUTE … TO anon` e **atualiza `vehicles`** sem checar quem chama nem se o veículo é dele. Qualquer pessoa na internet, só com a chave publishable, pode sobrescrever posição/bateria/O₂ de qualquer veículo. → Revogar `anon`; checar propriedade/papel; validar faixas (lat/lng, 0–100%).
- **`flight_routes` UPDATE `using (true)`** para qualquer autenticado: qualquer usuário edita rotas de todos. → Restringir a dono/admin; adicionar `with check`.
- **`maintenance_logs` INSERT `with check (true)`**: qualquer usuário registra manutenção em qualquer veículo. Mesma correção (ou só via RPC `execute_maintenance`).
- **`flight_telemetry_logs` legível por `anon`** — avaliar se telemetria de frota deve ser pública.
- **`vehicle_sales` legível por `anon`** — ok para marketplace público, mas confirmar que não expõe dados do vendedor (`seller_id`).
- **Migrations duplicadas/sobrepostas**: `vehicle_sales` e `vehicle_purchases` são criadas em `…140000` e de novo em `…090000` (com `if not exists`). Há também `COMPLETE_ARES_MIGRATION.sql` solto. Três caminhos para o mesmo schema aumentam o risco de divergência. → Uma fonte: migrations; remover/arquivar o "COMPLETE".
- `supabase/.temp/` está untracked → adicionar ao `.gitignore`.
- `book_vehicle` tem overloads (5 args e 9 args); o antigo continua com `GRANT`. → Dropar a assinatura antiga.

### 🟡 Médio — Código / Arquitetura

- **Tipagem**: 115 erros de `tsc`. A maior parte vem do `exactOptionalPropertyTypes` e `noUncheckedIndexedAccess` (props `X | undefined` passadas a `X`; `arr[0]` possivelmente `undefined`). O build do Vite passa porque não faz typecheck, então **erros de tipo chegam a produção silenciosamente**. Não existe script `typecheck` nem CI.
- **Componentes gigantes** (6 arquivos com 800–1.600 linhas) misturam UI, geração procedural de textura/canvas, lógica de negócio e estado. Difícil de testar (por isso o ruído de canvas no jsdom) e de revisar.
- **`any` ×60** concentrado em `server/app.ts`, `app.tsx` (`Promise.race … as any`) e rotas. Perde-se a vantagem do `types.ts` gerado do Supabase.
- **`catch {}` vazio ×7** engolindo erros (ex.: `app.tsx` getUser, `server/app.ts` RPC).
- **Três fontes de dados**: Supabase, `ares-seed-data.ts` (717 linhas), `localStorage` (`ares_demo_rentals`, `ares_local_maintenance_logs`) e memória do Express. Falta uma camada única (`repository`) com modo real/demo.
- **Duas lockfiles** (`bun.lock` tracked, `pnpm-lock.yaml` novo) + `bunfig.toml` + patch de pnpm. Escolher um gerenciador.
- **Patch de `@react-three/fiber`** (`patches/` + `scripts/apply-r3f-patch.mjs` + `r3f-devtools-patch.ts`) — frágil a cada upgrade. Documentar motivo e como remover.
- **Rotas**: `painel.tsx` só redireciona; `routeTree.gen.ts` está modificado (gerado — não editar à mão).
- **`scripts/*.mjs`** com `puppeteer-core` (capturas e testes e2e ad-hoc) sem documentação nem integração ao `package.json`.
- **Versões**: `nitro` beta, `rolldown` por `overrides`, `vite 8.1.5` fixo. Funciona, mas é superfície de quebra em upgrades — travar e documentar.
- `lang="en"` no `<html>` com UI em português (`__root.tsx:104`).
- Fonts via Google Fonts (CDN externo, bloqueia render; LGPD/privacidade). → self-host com `@fontsource`.
- Pasta `src/routes/README.md` dentro de `routes` pode ser interpretada como rota/ruído pelo plugin.

### 🔵 Estilização / UX

**Pontos fortes**: sistema de tokens OKLCH coerente (`--primary` laranja Marte, `--accent` ciano telemetria), utilitários `glass`, `cut-corner`, `hud-grid`, `scanline` com identidade HUD clara. Tailwind v4 + Radix/shadcn é uma boa base.

**Problemas**:
1. **Tokens contornados**: ~261 ocorrências de `#hex`/`rgba(` hardcoded em `.tsx`, e `styles.css` repete `rgba(0, 240, 255, …)` em vez de `var(--telemetry)`. Mudar o tema = caçar valores.
2. **`!important` em todas as regras de scrollbar** e `*` com `scrollbar-width` global: duplica `.hud-scrollbar` (mesmas regras, valores quase idênticos). Consolidar em um utilitário e usar tokens.
3. **Só tema escuro**: `@custom-variant dark` existe mas `:root` é escuro e não há `.dark`; sem `prefers-color-scheme`/`color-scheme: dark` declarado (afeta form controls nativos e scrollbar).
4. **Acessibilidade** (a verificar com axe): contraste de `--muted-foreground` sobre `glass` translúcido; canvases 3D sem alternativa textual / `aria-label`; modais (`BookingWizardModal`) precisam de foco preso e `Esc`; sem `prefers-reduced-motion` para `scanline`, framer-motion e as animações 3D.
5. **Performance visual**: `backdrop-filter: blur(14px)` em muitos painéis + várias cenas WebGL simultâneas (Hangar, Radar, Chase) — risco de queda de FPS em notebooks. Só montar um canvas por vez e pausar `frameloop` quando fora de vista.
6. `--radius-md` e `--radius-lg` iguais, `--radius-sm` quase igual: escala de raios colapsada.
7. Texto em PT-BR e `lang="en"`; sem i18n estruturado (strings espalhadas).
8. Responsividade: sidebar vira topo em mobile (`md:flex-row`), mas telas densas (`my-rentals` 1.057 linhas, `booking`) precisam de revisão em 360–414 px.

## 3. Spec

### Princípios de execução segura
1. **Nada de mudança funcional sem rede de segurança**: primeiro commit do estado atual, depois lint/tipos, depois comportamento.
2. **Um PR/commit por fase**, build + testes verdes antes de avançar. Commits só adicionam; **sem force-push, rebase, amend ou squash** de histórico já enviado (Lovable sincroniza a `main`).
3. Cada fase é reversível com `git revert` de um commit.
4. Antes de qualquer migration em produção: rodar em um **branch/projeto Supabase de staging**.

### Fase 0 — Salvar e congelar (pré-requisito, ~30 min)
- Criar branch `chore/baseline`; commitar o working tree atual **em commits temáticos** (3D, booking, marketplace, backend, migrations, testes). Sem reformatar nesse momento.
- `.gitignore` += `.env*`, `supabase/.temp/`, `.output/`, `.wrangler/` (já). `git rm --cached .env`; criar `.env.example`.
- Decidir gerenciador (recomendado: **pnpm**, já usado pelo patch) e remover `bun.lock` + `bunfig.toml`.
- Adicionar `.gitattributes` com `* text=auto eol=lf` e `.prettierrc` `endOfLine: "lf"`.
- **Aceite**: `git status` limpo; build e testes continuam verdes.

### Fase 1 — Higiene automática (baixo risco)
- `prettier --write .` + `eslint --fix` em **commit separado** (só formatação, zero lógica → fácil de ignorar em `git blame` via `.git-blame-ignore-revs`).
- Scripts: `"typecheck": "tsc --noEmit"`, `"check": "pnpm typecheck && pnpm lint && pnpm test && pnpm build"`.
- Mock global de `HTMLCanvasElement.getContext` em `src/test/setup.ts` (elimina o ruído) ou `vitest-canvas-mock`.
- **Aceite**: `eslint` só com erros reais (≈78); build/testes verdes.

### Fase 2 — Bugs reais e tipagem
- Corrigir os 5 `react-hooks/rules-of-hooks`.
- Zerar os 115 erros de `tsc`, por pasta (`lib` → `components` → `routes` → `test`). Preferir corrigir o tipo/prop (`?: T | undefined`, guard) a `!` ou `as`.
- Trocar `any` por tipos de `Database["public"]["Tables"]…`; substituir `catch {}` por log + tratamento.
- `lang="pt-BR"`.
- **Aceite**: `pnpm check` verde. Adicionar `typecheck` ao gate.

### Fase 3 — Segurança (maior valor)
**3a. Front/segredos** — S1 e `.env.example` (feitos na Fase 0). Modo demo atrás de `VITE_DEMO_MODE`.
**3b. Banco** — nova migration `…_security_hardening.sql` (não editar as antigas):
  - `revoke execute on function record_flight_telemetry from anon;` + checagem de dono dentro da função + validação de faixas.
  - Policies de `flight_routes` e `maintenance_logs`: escopo por dono/admin, com `with check`.
  - `drop function book_vehicle(uuid,uuid,uuid,int,int)`.
  - Consolidar schema; arquivar `COMPLETE_ARES_MIGRATION.sql`.
  - Testes SQL (pgTAP ou script) provando que `anon` e usuário B **não** conseguem escrever dados do usuário A.
**3c. Backend Express** — decisão em §6. Se mantido: exigir `Authorization: Bearer` + `getUser(token)` em toda rota exceto `/health`; criar o client com o token do usuário (RLS aplicado), **nunca** service role; remover token/e-mail demo fixos e defaults de chave; validar bodies com `zod` (já é dependência); não aceitar `user_license` do cliente; não devolver 201 em fallback; CORS por env; CSP no helmet.
- **Aceite**: testes automatizados de acesso negado; revisão com `/security-review`.

### Fase 4 — Design system e estilização
- Tokens: mover **todas** as cores literais para variáveis (`--telemetry-rgb`, `--hud-glow`, estados `success/warning/danger`), adicionar escala `--radius-*` real, `--shadow-*`, `--z-*`, `--space-*` se necessário. Meta: ≤ 20 hex literais (apenas dentro de shaders/Three).
- Consolidar scrollbar em um utilitário `@utility hud-scrollbar` sem `!important`.
- `color-scheme: dark` em `:root`; `@media (prefers-reduced-motion)` desligando scanline, framer-motion e auto-rotate 3D.
- Primitivos de UI próprios sobre shadcn: `HudPanel`, `StatTile`, `StatusBadge`, `SectionHeader`, `Stepper` — substituir blocos repetidos de classes nas rotas.
- Fontes self-hosted (`@fontsource/chakra-petch`, `@fontsource/jetbrains-mono`) com `font-display: swap`.
- Acessibilidade: auditoria com axe/Lighthouse; foco visível (`--ring`), trap de foco e `Esc` nos modais, `aria-label`/`role="img"` + descrição textual para canvases, contraste ≥ 4.5:1.
- Responsivo: checklist 360/390/768/1280 para cada rota (screenshot com os scripts puppeteer já existentes).
- **Aceite**: regressão visual por screenshot (antes/depois da fase), Lighthouse a11y ≥ 95, sem alteração de funcionalidade.

### Fase 5 — Arquitetura e performance
- Quebrar arquivos > 400 linhas: extrair `FlightChaseViewer3D` em `scene/` (terreno, atmosfera, veículo, câmera, HUD), texturas procedurais para `lib/textures/` (puras, testáveis), `BookingWizardModal` em passos (`steps/*`) + hook `useBookingForm`.
- Camada `repository` única (`vehicles`, `rentals`, `maintenance`) com implementação Supabase e demo; fim do `localStorage` espalhado.
- Preço/regras em **um** módulo compartilhado (`lib/pricing.ts`) usado por UI e testes, e validado pelo RPC SQL como autoridade.
- Perf: `React.lazy` para cenas 3D (já são chunks por rota — validar), carregar `drei` por import nomeado, 1 canvas ativo por vez, `frameloop="demand"` quando ocioso, texturas em tamanho/cache controlado, budget de bundle (ex.: chunk inicial < 250 kB gz).
- **Aceite**: nenhum arquivo > 500 linhas; testes cobrindo os módulos extraídos.

### Fase 6 — Qualidade contínua
- CI (GitHub Actions): `pnpm install --frozen-lockfile && pnpm check`.
- Husky/lint-staged opcional. Renovate/Dependabot com agrupamento; fixar `nitro`/`vite`.
- Documentar em `README.md`: setup, `.env`, modo demo, Supabase local, patch R3F, scripts puppeteer. Substituir o texto-prompt atual do README.
- Convenção de commits e `CODEOWNERS` para `supabase/migrations`.

## 4. Ordem recomendada e esforço

| Fase | Risco | Esforço | Ganho |
|---|---|---|---|
| 0 Baseline | Muito baixo | 0,5 h | Segurança de trabalho |
| 1 Higiene | Baixo | 1–2 h | Ruído de lint some |
| 2 Tipos/bugs | Médio | 1–2 dias | Bugs reais pegos antes de produção |
| 3 Segurança | Médio-alto (DB) | 1–2 dias | Fecha vulnerabilidades reais |
| 4 Estilo/A11y | Baixo-médio | 2–3 dias | Consistência e acessibilidade |
| 5 Arquitetura/perf | Médio | 3–5 dias | Manutenção e FPS |
| 6 CI/Docs | Baixo | 0,5–1 dia | Sustenta o resto |

Fases 3 e 4 podem rodar em paralelo após a 2.

## 5. Definição de pronto (global)
`pnpm check` verde · 0 erros `tsc` · 0 erros eslint · 0 policies `using (true)` de escrita · nenhum segredo/default hardcoded · nenhum `anon` com `EXECUTE` em função que escreve · Lighthouse a11y ≥ 95 · README atualizado.

## 6. Decisões necessárias do dono do projeto
1. **Backend Express**: remover (o front não o usa; Supabase + RLS/RPC já cobrem) *ou* manter como BFF autenticado? **Recomendação: remover**, a menos que haja necessidade de integração server-side específica.
2. **Modo demo** deve existir em produção? Recomendação: apenas em staging/dev, por flag.
3. **Telemetria e rotas de voo** devem ser públicas (`anon`) ou só para autenticados? Recomendação: autenticados.
4. **Gerenciador de pacotes**: pnpm (recomendado) ou bun.
5. Deploy alvo (Lovable/Cloudflare via nitro/wrangler?) — define variáveis de ambiente e CSP.

## 7. Riscos e mitigação
- *Migration quebra dados*: testar em staging; migrations só aditivas (`drop` apenas da função antiga duplicada).
- *Correção de tipos altera comportamento*: manter commits por pasta + testes existentes (46) como rede; adicionar testes antes de refatorar componentes grandes.
- *Reformatação gera diffs enormes*: commit isolado + `.git-blame-ignore-revs`.
- *Sincronização Lovable*: só commits novos na `main`; nunca reescrever histórico; manter a branch sempre buildável.
