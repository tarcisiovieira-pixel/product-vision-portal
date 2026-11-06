<div align="center">

# ◆ ARES MOBILITY

### Mobilidade para quem mora em Marte.

Alugue, compre e acompanhe carros voadores, caminhões espaciais e foguetes
em uma única plataforma, com a frota em 3D e o clima em tempo real.

`React 19` · `TanStack Start` · `Three.js` · `Fastify` · `Supabase`

[A promessa](#-a-promessa) · [Módulos](#-módulos) · [Arquitetura](#-arquitetura) · [Rodar localmente](#-rodar-localmente) · [Testes](#-testes) · [Status](#-status-do-projeto)

</div>

---

## ◆ A promessa

**Tornar cada cratera de Marte a um voo de distância.**

A ARES une a facilidade de reservar em uma locadora à precisão de um centro de controle espacial: em minutos você escolhe um veículo, reserva e acompanha o voo em 3D.

> Este é um projeto conceito. Marte, os créditos (MC$) e a frota são fictícios. O software é real: autenticação, banco de dados, API, regras de negócio e testes.

## ◆ A dor

| | Problema | O que acontece hoje |
|---|---|---|
| 🌪️ | **Tempestades imprevisíveis** | Rotas somem sob a poeira e colonos ficam presos sem aviso. |
| 📡 | **Frota sem visibilidade** | Ninguém sabe onde está cada veículo nem quanto oxigênio resta. |
| 📋 | **Reservas analógicas** | Rádio e planilha de papel: alugar um foguete levava dias. |

## ◆ A solução

Um só portal para **reservar, rastrear e cuidar da frota**.

- **Reserva guiada**, com validação de habilitação, saldo e clima antes de confirmar.
- **Frota viva em 3D**: radar de Marte, hangar e acompanhamento de voo.
- **Regras no servidor**: preço e permissões são decididos no backend, não na tela.

## ◆ Módulos

### Disponíveis

| Módulo | O que faz |
|---|---|
| 🚀 **Locadora** | Busca por hangar e categoria, opcionais, cálculo de custo e reserva. |
| 🎫 **Minhas Reservas** | Lista, filtros, chave quântica, estender e cancelar com reembolso. |
| 🛰️ **Radar Marte** | Globo 3D com a frota em movimento, tempestades e rotas. |
| 🛩️ **Voo 3D** | Acompanhamento em câmera traseira, cockpit ou 360°, com turbo e áudio. |
| 🏗️ **Hangar 3D** | Inspeção de cada veículo pairando no pad, com dados técnicos. |
| 🔧 **Manutenção** | Saúde da frota, diagnóstico por pontos no modelo 3D e ordens de serviço. |
| 🛒 **Marketplace** | Compra de naves e publicação de anúncios. |
| 🔐 **Contas e demo** | Cadastro com confirmação por e-mail, login e modo demo sem cadastro. |

### Programados

| Módulo | O que vai fazer |
|---|---|
| 🤖 **Copiloto de bordo (IA)** | GPS com assistente de voz e texto: rota, clima e alertas em linguagem natural. |
| 📊 **Relatórios com IA** | Resumo de custos, uso da frota e sugestões, gerado sob demanda. |
| 🔮 **Manutenção preditiva** | Previsão de falhas a partir da telemetria dos veículos. |
| 🧭 **Centro de comando** | Painel inicial com tudo o que importa ao piloto. |
| 🎯 **Missões, carteira e perfil** | Missões, extrato de créditos, histórico e reputação do piloto. |
| 🌦️ **Clima e notificações** | Previsão por setor e avisos em tempo real. |
| 🛠️ **Administração** | Gestão de frota, hangares e usuários. |

Detalhes e decisões: [`docs/SPEC-ADENDO-DECISOES.md`](docs/SPEC-ADENDO-DECISOES.md).

## ◆ Arquitetura

```
┌──────────────────┐      ┌───────────────────┐      ┌───────────────────┐
│   Front (React)  │ ───► │   API (Fastify)   │ ───► │     Supabase      │
│  Deploy: Lovable │      │   Deploy: Render  │      │ Postgres · Auth   │
│  Só apresenta    │      │  Valida e decide  │      │ RLS · Realtime    │
└──────────────────┘      └───────────────────┘      └───────────────────┘
```

- **A API é opcional durante a migração.** Com `VITE_API_URL` definida, reservas, manutenção e compras passam por ela. Sem a variável, o front chama direto as funções do banco, que aplicam as mesmas regras.
- **Dupla proteção.** A API repassa o token do usuário, então a RLS continua valendo no banco.
- **Modo demo é um sandbox local.** Ele usa dados fictícios salvos no navegador e nunca toca no banco. Conta real nunca enxerga dados demo.

## ◆ Estrutura do projeto

```
.
├── src/                    Front
│   ├── routes/             Telas (uma por arquivo: app.booking, app.mars-radar…)
│   ├── components/         Componentes, cenas 3D e ui/ (shadcn)
│   ├── lib/
│   │   ├── ares-data.ts    Leituras (queries)
│   │   ├── ares-actions.ts Escritas (demo, API ou RPC, em um só lugar)
│   │   ├── session.ts      Regras do modo demo
│   │   └── api-client.ts   Cliente da API
│   └── test/               Testes unitários do front
├── backend/                API Fastify (package.json próprio)
│   ├── src/modules/        rentals · maintenance · marketplace · me · health
│   ├── src/plugins/        Autenticação e tratamento de erros
│   └── test/               Testes unitários e de integração
├── supabase/
│   ├── migrations/         Histórico do banco (só novas migrations)
│   └── tests/              Ataques simulados contra o banco
├── scripts/e2e/            Testes no navegador real
├── docs/                   Auditoria, decisões e plano
└── render.yaml             Deploy da API
```

## ◆ Rodar localmente

**Precisa de:** Node.js 20+ e, para o banco local, Docker.

### Só o app (o caminho mais rápido)

```sh
npm install
cp .env.example .env     # preencha com os dados do seu projeto Supabase
npm run dev              # http://localhost:8080
```

Clique em **Entrar no modo demo**: não precisa de conta.

### Ambiente completo (banco, API e app)

```sh
# 1. Banco local com todas as migrations. Anote o publishable key exibido.
npx supabase start

# 2. API
cd backend && npm install
cp .env.example .env     # SUPABASE_URL=http://127.0.0.1:54321 e a chave acima
npm run dev              # http://localhost:3001

# 3. App apontando para o banco e a API locais (em outro terminal, na raiz)
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_PUBLISHABLE_KEY=<chave> \
VITE_API_URL=http://localhost:3001 \
npm run dev
```

No ambiente local não há confirmação de e-mail: o cadastro já entra no app.

## ◆ Testes

| Camada | Comando | Cobre |
|---|---|---|
| Front | `npm run check` | Tipos, lint, testes unitários e build. |
| API | `cd backend && npm run check` | Tipos, rotas, validações e build. |
| Integração | Abaixo | API + Auth + Postgres + RLS reais. |
| Navegador | Abaixo | Telas, login, reservas, animações 3D, tooltip e mobile. |

```sh
# Integração (com `supabase start` rodando)
cd backend
SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_KEY=<chave> npx vitest run

# Navegador (usa o Chrome instalado; o app precisa estar rodando)
E2E_BASE_URL=http://localhost:8080 npm run e2e

# Contra um Supabase que não seja local, pule a parte que cria contas
E2E_SKIP_USER=1 npm run e2e
```

## ◆ Deploy

| Parte | Como funciona |
|---|---|
| **Front** | Commits na `main` sincronizam com o Lovable automaticamente. |
| **API** | Render, a partir do `render.yaml`. Defina `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `CORS_ORIGINS`. |
| **Banco** | Aplique as migrations primeiro em um projeto de desenvolvimento e só depois em produção. |

Regras do repositório:

- O projeto está ligado ao Lovable: **nunca reescreva histórico já enviado** (force push, rebase, amend).
- A `main` precisa estar sempre funcionando.
- Mudanças no banco entram **só por migrations novas**.
- Nenhuma chave secreta no código ou no git.

## ◆ Status do projeto

**Pronto e testado**

- [x] Cadastro, login e modo demo isolados entre si
- [x] Reservas, extensão, cancelamento com reembolso, manutenção e compra
- [x] Ocupação por período: o banco impede duas reservas do mesmo veículo em sols sobrepostos
- [x] API Fastify com validação, autenticação, limite de requisições e erros padronizados
- [x] Animações de voo, radar e hangar em movimento
- [x] Interface enxuta, com detalhes no ícone de informação

**Pendente em produção**

- [ ] Aplicar a migration `20261106120000` (ocupação de veículos)
- [ ] Publicar a API no Render e definir `VITE_API_URL` no front
- [ ] Mover as leituras restantes do front para a API

**Limitações conhecidas**

- A compra no marketplace ainda não credita o vendedor.
- A barreira anti-tempestade aparece no preço da tela, mas ainda não é cobrada pelo banco em contas reais.
