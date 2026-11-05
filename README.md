# ARES Mobility — Portal de mobilidade em Marte

> Um app para **alugar, vender e acompanhar veículos em Marte**: carros voadores, caminhões espaciais e foguetes. Tem reservas, hangar 3D, radar do planeta, manutenção e um marketplace.

Este projeto nasceu no [Lovable](https://lovable.dev) e continua sincronizado com ele pelo GitHub.

---

## 1. Qual é o problema?

O app já funciona e é bonito, mas foi crescendo rápido e hoje tem quatro dores:

| Dor | Em português simples |
|---|---|
| **Segurança** | Algumas regras do banco deixam qualquer pessoa mexer em dados que não são dela (ex.: alterar a posição de qualquer veículo). Um arquivo com configurações (`.env`) estava dentro do git. |
| **Bagunça no código** | Há centenas de avisos de formatação, 115 erros de tipo e arquivos com mais de 1.000 linhas. Isso torna difícil mexer sem quebrar algo. |
| **Tudo depende do front** | As regras de negócio (preço, licença do piloto, reserva) ficam espalhadas entre a tela e o banco. Para crescer (IA, pagamentos, relatórios) precisamos de um servidor próprio. |
| **Visual** | O estilo é bom, mas não é consistente nem "de outro planeta" ainda. Muitas cores estão escritas à mão em vez de seguirem um padrão. |

## 2. Para onde vamos

```
Tela (Lovable)  ──►  API própria (Render)  ──►  Banco Supabase
  só mostra         regras, IA, pagamentos       dados, login, arquivos
```

- **Tela:** só apresenta os dados. Não decide regras.
- **API (nova):** é quem decide e grava. Feita com Fastify.
- **Supabase:** guarda os dados e cuida do login. Continua com as travas de segurança (RLS) como segunda proteção.

## 3. O que já foi feito ✅

- [x] **Auditoria completa** do projeto (segurança, código, banco, visual) → `docs/SPEC-MELHORIAS.md`
- [x] **Decisões registradas** (backend, demo, deploy, IA, visual) → `docs/SPEC-ADENDO-DECISOES.md`
- [x] **Salvamos o trabalho** que estava solto: 48 arquivos viraram commits organizados
- [x] **`.env` saiu do git** e agora existe um `.env.example` só com os nomes das variáveis
- [x] **Código formatado** de forma padronizada; avisos do lint caíram de **6.560 para 78**
- [x] **Scripts novos:** `npm run typecheck` e `npm run check`
- [x] **Testes mais limpos** (sem o ruído do canvas)
- [x] **API nova criada** em `backend/` (Fastify): validação de configuração, headers de segurança, CORS restrito, limite de requisições, login por token do Supabase, `/health` e `/v1/me`, com 8 testes
- [x] **Arquivo de deploy do Render** (`render.yaml`) e **CI** no GitHub (`.github/workflows/ci.yml`)

## 4. O que falta fazer 🔜

Em ordem de prioridade:

1. **Corrigir erros de código (Fase 2)** — zerar os 115 erros de tipo e os 5 bugs de "hooks" do React. Depois disso o CI passa a ser obrigatório.
2. **Fechar as brechas do banco (Fase 3)** — nova migration para: tirar o acesso anônimo da telemetria, limitar quem edita rotas e manutenção, remover função duplicada de reserva.
3. **Mover as regras para a API** — um fluxo por vez: reservas → manutenção → marketplace. A tela passa a chamar a API.
4. **Apagar o servidor antigo (Express)** em `server/`, depois que a API nova cobrir as rotas.
5. **Modo demo seguro** — trocar o "login falso no navegador" por um usuário demo de verdade no Supabase.
6. **Visual novo (Fase 4)** — design system, animações, 3D com pós-processamento, landing e login cinematográficos.
7. **IA** — copiloto de bordo (GPS com assistente), relatórios e manutenção preditiva, sempre via API.
8. **Novas telas** — centro de comando, missões, relatórios, clima, carteira, perfil do piloto.
9. **Ajustes finais** — limpar arquivos gigantes, documentar tudo e ligar o CI de forma estrita.

## 5. Coisas que só você pode fazer 👤

- [ ] Criar o serviço no **Render** a partir do `render.yaml` e preencher no painel: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `CORS_ORIGINS` (a URL do front no Lovable).
- [ ] Criar um **projeto Supabase de desenvolvimento**, separado do de produção.
- [ ] Decidir o **gerenciador de pacotes** (o Lovable usa bun; o `bun.lock` está desatualizado).
- [ ] Revisar a branch `chore/baseline` e fazer o merge na `main` quando estiver satisfeito.

## 6. Como rodar

**Pré-requisito:** Node.js 20 ou mais novo.

### Front (tela)
```sh
npm install
cp .env.example .env     # preencha com os dados do seu projeto Supabase
npm run dev              # abre em http://localhost:8080
```

### API
```sh
cd backend
npm install
cp .env.example .env     # preencha SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY
npm run dev              # sobe em http://localhost:3001
```
Teste rápido: abra `http://localhost:3001/health` — deve responder `{"status":"ok"}`.

### Conferir se está tudo certo
```sh
npm run check            # front: tipos + lint + testes + build
cd backend && npm run check   # API: tipos + testes + build
```
> Hoje o `typecheck` e o `lint` do front ainda mostram erros. Isso é esperado e será corrigido na Fase 2.

## 7. Regras de trabalho (importante)

- O projeto está ligado ao Lovable. **Nunca reescrever o histórico do git** (nada de force push, rebase, amend ou squash em commits já enviados).
- Os commits na `main` aparecem no Lovable, então a `main` deve sempre estar funcionando.
- Mudanças no banco entram **só por migrations novas** em `supabase/migrations/`, testadas antes num projeto de desenvolvimento.
- Nunca colocar chaves secretas no código ou no git.

## 8. Mapa das pastas

```
src/          Front (telas, componentes, 3D)
backend/      API Fastify (próprio package.json)
server/       API antiga em Express — será removida
supabase/     Migrations do banco
docs/         Auditoria, decisões e plano
scripts/      Utilitários de captura/teste com navegador
render.yaml   Configuração de deploy da API
```

## 9. Documentos

- `docs/SPEC-MELHORIAS.md` — auditoria completa e plano em fases
- `docs/SPEC-ADENDO-DECISOES.md` — decisões: backend, demo, deploy, IA e visual
