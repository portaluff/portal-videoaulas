# Portal de Videoaulas UFF

Novo site do **Portal de Videoaulas da Universidade Federal Fluminense**, projeto de extensão do Instituto Biomédico (coordenação: Prof. Ismar Araujo de Moraes).

O site é **estático**: as páginas são geradas a partir de arquivos de dados e publicadas gratuitamente no **GitHub Pages**. Os vídeos continuam hospedados no **YouTube**.

- Endereço provisório: https://portaluff.github.io/portal-videoaulas/
- Tecnologia: [Astro](https://astro.build) (gerador de site estático), sem banco de dados e sem servidor próprio.

## O que o site tem

- Página inicial com abertura animada (a sigla UFF vira o botão de play), busca, áreas, aulas mais assistidas e trilhas.
- Páginas por **disciplina**, com filtros por tema, por recursos (quiz, resumo) e ordenação.
- Página de cada **videoaula**: player do YouTube, resumo e **quiz com feedback imediato** (gerados por IA e revisados pelo professor), referências e espaço para dúvidas (a ativar).
- **Trilhas de estudo**: sequências de aulas com navegação entre elas.
- **Busca** em todas as aulas.
- **Área do professor** em `/admin/` para editar o conteúdo sem mexer em código.

## Onde fica o conteúdo

| O quê | Arquivo |
|---|---|
| Cada videoaula | `src/data/aulas/<endereco-da-aula>.json` |
| Áreas e disciplinas | `src/data/areas.json` |
| Trilhas de estudo | `src/data/trilhas.json` |

O nome do arquivo da aula vira o endereço da página: `src/data/aulas/rins.json` → `/aula/rins/`.

Exemplo de aula (veja `src/data/aulas/rins.json`, que tem resumo e quiz completos):

```json
{
  "titulo": "Rins",
  "disciplina": "anatomia",
  "tema": "Sistema urinário",
  "youtube": "ID_DO_VIDEO",
  "professor": "Nome do professor",
  "data": "2013-06-07",
  "views": 53081,
  "descricao": "Texto curto sobre a aula.",
  "resumo": [{ "rotulo": "Localização", "texto": "..." }],
  "resumoRevisado": false,
  "quiz": [{ "pergunta": "...", "opcoes": ["A", "B", "C", "D"], "correta": 1, "explicacao": "..." }],
  "quizRevisado": false,
  "referencias": ["..."]
}
```

- `youtube`: só o código do vídeo (o que vem depois de `v=` no link).
- `correta`: número da alternativa certa, começando em **1**.
- `resumoRevisado` / `quizRevisado`: mude para `true` só depois que o professor conferir o que a IA gerou.

> **Conteúdo de amostra:** as aulas atuais vieram das páginas públicas do portal antigo (títulos, datas e visualizações), ainda sem o código do YouTube e sem professor. Elas serão substituídas pela migração completa do banco de dados do Drupal.

## Publicação

Cada `push` na branch `main` gera e publica o site automaticamente (`.github/workflows/deploy.yml`).

Configuração única no GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### Usar o domínio próprio

1. No provedor do domínio (ou na STI, se for um subdomínio de uff.br), crie um registro **CNAME** apontando para `portaluff.github.io`.
2. No GitHub: **Settings → Pages → Custom domain**, informe o domínio e marque **Enforce HTTPS**.
3. Em `.github/workflows/deploy.yml`, troque `SITE_URL` pelo domínio (`https://...`) e `BASE_PATH` por `/`.
4. Peça à STI para redirecionar `videoaulas.uff.br` para o novo domínio, para os links antigos continuarem funcionando.

## Painel do professor (`/admin/`)

O painel usa o [Decap CMS](https://decapcms.org): formulários para criar e editar aulas, resumos, quizzes e trilhas. Cada alteração vira um commit e o site se republica sozinho.

Para o login funcionar no GitHub Pages, o TI precisa:

1. Criar um **OAuth App** no GitHub (Settings → Developer settings → OAuth Apps).
2. Publicar um pequeno serviço de autenticação para o Decap (por exemplo, um Cloudflare Worker gratuito) com o ID e o segredo desse OAuth App.
3. Preencher `base_url` em `public/admin/config.yml` com o endereço desse serviço.

Quem edita pelo painel precisa de uma conta no GitHub com permissão de escrita neste repositório.

## Resumo e quiz com IA (Gemini)

O workflow `.github/workflows/gerar-conteudo-ia.yml` gera automaticamente o **resumo** e o **quiz** de cada aula que tenha vídeo no YouTube e ainda esteja sem esse conteúdo. Ele envia o link do vídeo para a API do Gemini (Google), que analisa a aula diretamente — não é preciso transcrição.

- **Quando roda:** sempre que uma aula é cadastrada ou alterada, todo dia às 03:17 (para ir processando o acervo aos poucos) e manualmente em **Actions → Gerar resumo e quiz com IA → Run workflow**.
- **Custo:** usa a faixa gratuita do Gemini, que aceita até 8 horas de vídeo do YouTube por dia. Por isso cada execução processa no máximo 8 aulas (`MAX_AULAS`). Só funciona com vídeos **públicos**.
- **Revisão:** tudo o que a IA gera entra como *aguardando revisão* (`resumoRevisado` e `quizRevisado` = `false`). O professor confere no painel e marca como revisado.
- **Exibição:** em `src/data/config.json` (ou no painel, em *Organização → Configurações*), `mostrarConteudoNaoRevisado`:
  - `true` — mostra o conteúdo ainda não revisado com o aviso "Aguardando revisão" (útil na fase de testes);
  - `false` — o conteúdo só aparece depois de revisado (recomendado quando o portal estiver em uso).
- **Nunca sobrescreve:** aulas que já têm resumo ou quiz não são alteradas. Para gerar de novo, apague o resumo/quiz da aula. Para não gerar numa aula específica, marque *Não gerar resumo/quiz com IA*.

### Configurar a chave (uma vez)

1. Crie uma chave gratuita no [Google AI Studio](https://aistudio.google.com) com a conta Google do projeto (*Get API key → Create API key*).
2. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**, nome `GEMINI_API_KEY`, valor = a chave.
3. (Opcional) Em **Variables**, crie `GEMINI_MODEL` para trocar o modelo usado (o Google renomeia modelos com frequência; o padrão está em `scripts/gerar-conteudo-ia.mjs`).

Nunca coloque a chave no código nem a envie por chat ou e-mail.

### Trocar de fornecedor de IA

Toda a chamada à IA fica na função `chamarGemini` de `scripts/gerar-conteudo-ia.mjs`. Se a faixa gratuita do Gemini mudar, basta trocar essa função por outro fornecedor que devolva o mesmo formato (descrição, resumo e quiz).

## Rodar no computador

Requer Node.js 22.23.4 ou mais recente (Node 24 recomendado).

```bash
npm install
npm run dev      # abre em http://localhost:4321/portal-videoaulas/
npm run build    # gera o site em dist/
```

## Próximas etapas

- [ ] Migrar todas as aulas do Drupal (backup `.sql` do banco) para `src/data/aulas/`.
- [ ] Conferir no canal do YouTube se nenhum vídeo ficou de fora.
- [ ] Configurar o login do painel do professor (OAuth).
- [ ] Apontar o domínio próprio.
- [ ] Configurar a chave do Gemini (`GEMINI_API_KEY`).
- [ ] Ativar o espaço de dúvidas (comunidade) e o progresso do aluno com login.
