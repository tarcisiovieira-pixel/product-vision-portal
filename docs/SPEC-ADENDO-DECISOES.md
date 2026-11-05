# Adendo à Spec — Decisões do dono (2026-11-04)

Complementa `SPEC-MELHORIAS.md`. Onde houver conflito, este documento vale.

## D1. Decisões
| # | Decisão | Consequência |
|---|---|---|
| 1 | Remover o backend Express | Apagar `server/`, script `backend`, deps `express`, `cors`, `helmet`, `express-rate-limit`, `supertest`, `@types/express|cors|supertest`, `tsx` (se não usado) e `src/test/backend-api.test.ts`. Ver D2 |
| 2 | Modo demo **permanece em produção** | Demo vira recurso de primeira classe e isolado (D3), não um atalho no `localStorage` |
| 3 | Deploy: GitHub → Lovable (autônomo) | Só commits novos na `main`; CI obrigatório; ver D4 |

## D2. O que configurar ao remover o Express
O front já fala direto com o Supabase. A "camada de servidor" passa a ser:
1. **RLS + RPCs `SECURITY DEFINER`** como autoridade das regras (reserva, licença, preço, manutenção). Já existem `book_vehicle` e `execute_maintenance`; falta endurecer (Fase 3b da spec).
2. **Rate limit / abuso**: painel do Supabase (limites de Auth, CAPTCHA/Turnstile no signup) no lugar do `express-rate-limit`.
3. **Headers de segurança** (no lugar do Helmet): `public/_headers` com CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors`. A CSP precisa liberar o domínio do Supabase e `blob:`/`data:` para o WebGL.
4. **CORS**: controlado pelo Supabase; nada no app.
5. **Lógica com segredo** (IA, e-mail, pagamentos): **Supabase Edge Functions**, nunca no browser (D6).
6. **Variáveis**: no front só `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Chaves privadas = *secrets* de Edge Function. `.env.example` + validação com `zod` no boot.

## D3. Demo em produção, com segurança
- Substituir `localStorage.ares_demo_session` (hoje dá acesso a `/app` só com uma chave no console) por **usuário real do Supabase**: *anonymous sign-in* ou conta `demo@aresmobility.com` com login via Edge Function `demo-login`.
- Passa pelo RLS como qualquer usuário; escritas limitadas ao próprio `user_id`; créditos fictícios isolados.
- `pg_cron` reseta os dados de demo periodicamente.
- `ares-seed-data.ts` fica só como vitrine pública/offline, nunca como sessão.
- **Aceite**: apagar/forjar o `localStorage` não dá acesso; demo não lê nem altera dados de outro usuário.

## D4. Deploy GitHub → Lovable
- Fluxo: branch → PR → CI verde → merge na `main` → Lovable sincroniza. A `main` deve sempre buildar.
- CI (`typecheck + lint + test + build`) é o único freio antes da publicação.
- Migrations: staging primeiro; só aditivas; nunca editar migration já aplicada; `types.ts` regenera depois.
- Não editar à mão arquivos "auto-generated" do Lovable (`integrations/supabase/client.ts`, `types.ts`) nem `routeTree.gen.ts`.
- Gerenciador de pacotes: o Lovable usa bun. **Manter bun** até confirmar que o build do Lovable aceita pnpm; o `pnpm-lock.yaml` e o patch do R3F precisam ser validados lá antes de qualquer troca.
- Secrets de Edge Function cadastrados no painel; nunca no repositório.

## D5. Próximas rotas
Padrão: `src/routes/app.<nome>.tsx` < 300 linhas, `loader` com `ensureQueryData`, lógica em hook/`lib`, teste da rota, item em `nav` (`app.tsx`).

| Rota | Função | IA |
|---|---|---|
| `/app` (index) | Centro de Comando: frota, reservas, alertas, KPIs, feed ao vivo | resumo diário |
| `/app/copilot` | **Assistente de bordo / GPS com IA** | núcleo |
| `/app/missions` | Planejador de missão: origem/destino, janela de sol, clima, consumo, rota | sim |
| `/app/fleet/$id` | Detalhe do veículo: telemetria, histórico, manutenção | diagnóstico |
| `/app/reports` | Relatórios de uso/custo/saúde/segurança, exportação PDF | narrativa |
| `/app/weather` | Tempestades de poeira, previsão por setor | texto |
| `/app/wallet` | Créditos, extrato, faturas | — |
| `/app/pilot` | Licenças, horas, reputação, conquistas | coaching |
| `/app/notifications` | Central de alertas (Realtime) | — |
| `/app/admin` | Operação (role admin): vendas, incidentes, auditoria | triagem |

Ordem: dashboard → copilot → fleet/$id → missions → reports → weather → wallet/pilot → admin.

## D6. IA — onde e como
**Casos de uso (prioridade):**
1. **Copilot de bordo / GPS com IA**: voz + texto em HUD sobre o Radar/Chase 3D. "Melhor rota até Olympus Mons evitando a tempestade?", "chego com 38% de bateria?", "o que significa este alerta?". O modelo usa **tool calling** sobre dados reais (`getTelemetry`, `planRoute`, `getWeather`, `listHangars`) e devolve **rota estruturada (JSON)** que o `RadarGlobe` desenha. Não inventa números.
2. **Relatórios**: resumo executivo semanal; a IA narra agregados calculados em SQL.
3. **Manutenção preditiva**: `wearScore` existente + explicação e priorização em linguagem natural.
4. **Assistente de reserva** no wizard ("3 pessoas, Valles Marineris, 5 sóis" → veículo, extras, licença, preço).
5. **Marketplace**: descrição de anúncio, faixa de preço sugerida.
6. **Briefing pré-voo** e **log de bordo** narrado.
7. **Busca em linguagem natural**; 8. **detecção de anomalias** na telemetria.

**Arquitetura segura:**
- Browser → **Edge Function `ai-copilot`** (valida JWT, cota por usuário, limite de tokens) → provedor LLM. Chave nunca no front.
- Streaming SSE. Ferramentas **somente leitura** na v1; ações (reservar/cancelar) exigem confirmação explícita na UI.
- Provedor: gateway de IA do Lovable (confirmar endpoint/secret na doc atual) **ou** API da Anthropic com secret próprio. Consultar a skill `claude-api` para IDs e parâmetros vigentes antes de implementar.
- Tabelas com RLS por `user_id`: `ai_conversations`, `ai_messages`, `ai_usage`.
- Voz na v1: Web Speech API (STT/TTS), sem custo.
- Guardrails: system prompts versionados, sem PII, log de ferramentas, fallback "Copiloto indisponível", tools determinísticas testadas em unidade, LLM mockado nos testes.

## D7. Visual "fora de série"
**Direção:** cockpit de nave em Marte — HUD holográfico, vidro fosco, poeira ferrosa, telemetria viva. Mantém laranja Marte + ciano e eleva o nível.

1. **Design system**: tokens completos (cor, raio, sombra, blur, z, motion), tipografia (Chakra Petch + JetBrains Mono para dados) e primitivos `HudPanel`, `StatTile`, `GaugeRing`, `StatusBadge`, `Reticle`, `ScanFrame`, `DataTicker`.
2. **Movimento**: framer-motion (já instalado) para rotas e layout compartilhado; **Lenis** (scroll suave) + **GSAP/ScrollTrigger** na landing; microinterações; `prefers-reduced-motion` respeitado.
3. **3D** (three/R3F/drei já presentes): `@react-three/postprocessing` (bloom, vinheta, aberração leve, grão), partículas de poeira, atmosfera, `PerformanceMonitor` para degradar com graça, **um canvas ativo por vez**.
4. **Efeitos de UI**: campo estelar/poeira de fundo, grade HUD animada, brilho que segue o cursor, contadores animados, onda de áudio no Copilot, bordas gradiente nos cantos cortados.
5. **Som** opcional (desligado por padrão).
6. **Landing cinematográfica** (hero 3D Marte + veículo, scroll narrativo dor → solução → frota → marketplace) e **login com sequência de "boot"**.
7. **Requisitos**: contraste ≥ 4.5:1, foco visível, modo "reduzir efeitos", ≥ 50 fps em notebook médio, chunk inicial < 250 kB gz.

Libs candidatas (travar versão antes de instalar): `@react-three/postprocessing`, `lenis`, `gsap`, `@fontsource/*`, `leva` (dev), `maath`. framer-motion + GSAP + R3F já cobrem tudo; evitar sobreposição.

**Execução:** delegar o trabalho visual a um agente Opus **depois** das Fases 0–2 (base limpa e tipada), em PRs por tela — landing, login, shell `/app`, booking, hangar/radar/chase, marketplace — cada uma com screenshots antes/depois (scripts puppeteer existentes) e gate de a11y/perf.

## D8. Ordem revisada
0 Baseline → 1 Higiene → 2 Tipos/bugs → 3 Segurança + remover Express + demo seguro → 4 Design system + visual → 5 Dashboard + Copilot IA (v1 leitura) → 6 Demais rotas + relatórios IA → 7 CI/Docs.
