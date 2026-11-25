# Portal de Videoaulas UFF

Novo site do **Portal de Videoaulas da Universidade Federal Fluminense**, projeto de extensão do Instituto Biomédico (coordenação: Prof. Ismar Araujo de Moraes).

O site é **estático**: as páginas são geradas a partir de arquivos de dados e publicadas gratuitamente no **GitHub Pages**. Os vídeos continuam hospedados no **YouTube**.

- Endereço provisório: https://portaluff.github.io/portal-videoaulas/
- Tecnologia: [Astro](https://astro.build) (gerador de site estático), sem banco de dados e sem servidor próprio.

## O que o site tem

- Página inicial com abertura animada (a sigla UFF vira o botão de play), busca, áreas, aulas mais assistidas e trilhas.
- Páginas por **disciplina**, com filtros por tema, por recursos (quiz, resumo) e ordenação.
- Página de cada **videoaula**: player do YouTube, resumo (gerado por IA e marcado como revisado ou não pelo professor), **quiz com feedback imediato**, referências e espaço para dúvidas (a ativar).
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
  "referencias": ["..."]
}
```

- `youtube`: só o código do vídeo (o que vem depois de `v=` no link).
- `correta`: número da alternativa certa, começando em **1**.
- `resumoRevisado`: mude para `true` só depois que o professor conferir o resumo gerado por IA.

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
- [ ] Ativar o espaço de dúvidas (comunidade) e o progresso do aluno com login.
