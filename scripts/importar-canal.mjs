#!/usr/bin/env node
// Importa os vídeos do canal do YouTube do portal (@videoaulasuff) como aulas do site.
//
// - Vídeo que já está em alguma aula (mesmo ID do YouTube): não mexe.
// - Vídeo com o mesmo título de uma aula sem vídeo: preenche o "youtube" dessa aula.
// - Vídeo novo: cria src/data/aulas/<endereco>.json, com a disciplina deduzida do título
//   ("[ANATOMIA] Rins" → Anatomia). Sem disciplina reconhecível → "Outros vídeos" (a classificar no painel).
//
// Fontes da lista de vídeos (uma das duas):
//   1. YOUTUBE_API_KEY definida → YouTube Data API v3 (oficial)
//   2. Caso contrário → arquivo JSON gerado por: yt-dlp --flat-playlist -J <canal>/videos
//
// Uso: node scripts/importar-canal.mjs [arquivo-do-yt-dlp.json]

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_AULAS = path.join(RAIZ, 'src/data/aulas');
const CANAL = process.env.CANAL || 'UCGwAgbhQ_GImSAF7G2QrRUQ';
const CHAVE_YT = process.env.YOUTUBE_API_KEY;

const normalizar = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const paraEndereco = (s) => normalizar(s).replace(/ /g, '-').slice(0, 80).replace(/-+$/, '');

// Etiqueta entre colchetes no título → disciplina (e tema, quando a etiqueta é um tópico)
const ETIQUETAS = {
  'anatomia': { disciplina: 'anatomia' },
  'neuroanatomia': { disciplina: 'neuroanatomia' },
  'cardiologia': { disciplina: 'cardiologia' },
  'semiologia': { disciplina: 'semiologia' },
  'anestesiologia': { disciplina: 'anestesiologia' },
  'parasitologia': { disciplina: 'parasitologia' },
  'farmacia': { disciplina: 'farmacia' },
  'nutricao': { disciplina: 'nutricao' },
  'saude coletiva': { disciplina: 'saude-coletiva' },
  'matematica': { disciplina: 'matematica' },
  'antropologia': { disciplina: 'antropologia' },
  'administracao': { disciplina: 'administracao' },
  'termodinamica': { disciplina: 'fisica', tema: 'Termodinâmica' },
  'eletromagnetismo': { disciplina: 'fisica', tema: 'Eletromagnetismo' },
  'mecanica analitica': { disciplina: 'fisica', tema: 'Mecânica Analítica' },
  'fisica moderna': { disciplina: 'fisica', tema: 'Física Moderna' },
  'fisica': { disciplina: 'fisica' },
};

function classificar(tituloYoutube) {
  const t = String(tituloYoutube).trim();
  const m = t.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (m) {
    const etiqueta = normalizar(m[1]);
    const resto = m[2].trim();
    if (etiqueta === 'medicina veterinaria') {
      const n = normalizar(resto);
      if (n.startsWith('fisiologia')) return { disciplina: 'fisiologia-veterinaria', titulo: resto };
      if (n.startsWith('anatomia')) return { disciplina: 'anatomia-veterinaria', titulo: resto };
      return { disciplina: 'a-classificar', titulo: resto };
    }
    const regra = ETIQUETAS[etiqueta];
    if (regra) {
      return regra.tema
        ? { disciplina: regra.disciplina, tema: regra.tema, titulo: `${regra.tema} — ${resto}` }
        : { disciplina: regra.disciplina, titulo: resto };
    }
    return { disciplina: 'a-classificar', titulo: t };
  }
  // Sem colchetes: títulos de Física começam pelo nome do tópico ("Eletromagnetismo Cap 07.03 - ...")
  const n = normalizar(t);
  for (const [chave, regra] of Object.entries(ETIQUETAS)) {
    if (regra.tema && n.startsWith(chave)) {
      const resto = t.slice(chave.length).replace(/^[\s:\-–—]+/, '');
      return { disciplina: regra.disciplina, tema: regra.tema, titulo: `${regra.tema} — ${resto}` };
    }
  }
  return { disciplina: 'a-classificar', titulo: t };
}

// ---------- Fontes ----------
async function listarPelaApi() {
  const base = 'https://www.googleapis.com/youtube/v3';
  const uploads = `UU${CANAL.slice(2)}`;
  const videos = [];
  let pagina = '';
  do {
    const r = await fetch(`${base}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${uploads}&key=${CHAVE_YT}${pagina ? `&pageToken=${pagina}` : ''}`);
    if (!r.ok) throw new Error(`YouTube API ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    for (const it of d.items ?? []) {
      videos.push({
        id: it.contentDetails.videoId,
        titulo: it.snippet.title,
        descricao: it.snippet.description ?? '',
        data: (it.contentDetails.videoPublishedAt ?? '').slice(0, 10),
      });
    }
    pagina = d.nextPageToken ?? '';
  } while (pagina);
  // Duração (para a IA respeitar o limite de horas por dia)
  for (let i = 0; i < videos.length; i += 50) {
    const lote = videos.slice(i, i + 50);
    const r = await fetch(`${base}/videos?part=contentDetails,status&id=${lote.map((v) => v.id).join(',')}&key=${CHAVE_YT}`);
    if (!r.ok) continue;
    const d = await r.json();
    for (const it of d.items ?? []) {
      const v = lote.find((x) => x.id === it.id);
      if (!v) continue;
      v.duracao = duracaoIso(it.contentDetails?.duration);
      v.publico = it.status?.privacyStatus === 'public';
    }
  }
  return videos.filter((v) => v.publico !== false);
}

function duracaoIso(iso) {
  const m = String(iso ?? '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : null;
}

async function listarPeloArquivo(arquivo) {
  const d = JSON.parse(await readFile(arquivo, 'utf8'));
  const achatar = (lista) => lista.flatMap((e) => (e?.entries ? achatar(e.entries) : [e]));
  return achatar(d.entries ?? [])
    .filter((e) => e?.id && e?.title && !/^\[(private|deleted) video\]$/i.test(e.title))
    .map((e) => ({
      id: e.id,
      titulo: e.title,
      descricao: e.description ?? '',
      data: e.upload_date ? `${e.upload_date.slice(0, 4)}-${e.upload_date.slice(4, 6)}-${e.upload_date.slice(6, 8)}` : '',
      duracao: Number.isFinite(e.duration) ? Math.round(e.duration) : null,
    }));
}

// ---------- Importação ----------
async function main() {
  const arquivo = process.argv[2];
  let videos;
  if (CHAVE_YT) videos = await listarPelaApi();
  else if (arquivo) videos = await listarPeloArquivo(arquivo);
  else throw new Error('Informe o arquivo do yt-dlp ou defina YOUTUBE_API_KEY.');
  console.log(`${videos.length} vídeo(s) públicos encontrados no canal.`);
  if (videos.length === 0) throw new Error('Nenhum vídeo encontrado — a listagem pode ter sido bloqueada.');

  const nomes = (await readdir(PASTA_AULAS)).filter((f) => f.endsWith('.json'));
  const aulas = [];
  for (const f of nomes) aulas.push({ arquivo: f, slug: f.replace(/\.json$/, ''), dados: JSON.parse(await readFile(path.join(PASTA_AULAS, f), 'utf8')) });
  const porVideo = new Map(aulas.filter((a) => a.dados.youtube).map((a) => [a.dados.youtube, a]));
  const enderecos = new Set(aulas.map((a) => a.slug));

  const chaveTitulo = (disciplina, titulo) => `${disciplina}|${normalizar(titulo)}`;
  const semVideo = new Map(aulas.filter((a) => !a.dados.youtube).map((a) => [chaveTitulo(a.dados.disciplina, a.dados.titulo), a]));
  // Também procura só pelo título (quando o título do YouTube não traz a disciplina), se for único
  const contagemTitulo = {};
  aulas.filter((a) => !a.dados.youtube).forEach((a) => { const k = normalizar(a.dados.titulo); contagemTitulo[k] = (contagemTitulo[k] ?? 0) + 1; });
  const buscarSemVideo = (c) => {
    const exato = semVideo.get(chaveTitulo(c.disciplina, c.titulo));
    if (exato) return exato;
    const k = normalizar(c.titulo);
    if (contagemTitulo[k] !== 1) return null;
    for (const a of semVideo.values()) if (normalizar(a.dados.titulo) === k) return a;
    return null;
  };

  const resumo = { jaExistiam: 0, titulosDiferentes: [], vinculados: [], novos: [], aClassificar: [] };
  for (const v of videos) {
    if (porVideo.has(v.id)) {
      resumo.jaExistiam += 1;
      const a = porVideo.get(v.id);
      if (normalizar(a.dados.titulo) !== normalizar(classificar(v.titulo).titulo)) resumo.titulosDiferentes.push(`${a.slug}: no site "${a.dados.titulo}" · no YouTube "${v.titulo}"`);
      continue;
    }
    const c = classificar(v.titulo);

    const existente = buscarSemVideo(c);
    if (existente) {
      existente.dados.youtube = v.id;
      if (!existente.dados.data && v.data) existente.dados.data = v.data;
      if (v.duracao) existente.dados.duracao = v.duracao;
      await writeFile(path.join(PASTA_AULAS, existente.arquivo), `${JSON.stringify(existente.dados, null, 2)}\n`);
      semVideo.delete(chaveTitulo(existente.dados.disciplina, existente.dados.titulo));
      porVideo.set(v.id, existente);
      resumo.vinculados.push(`${existente.slug} ← ${v.titulo}`);
      continue;
    }

    let slug = paraEndereco(c.titulo) || v.id.toLowerCase();
    if (enderecos.has(slug)) { let n = 2; while (enderecos.has(`${slug}-${n}`)) n += 1; slug = `${slug}-${n}`; }
    enderecos.add(slug);

    const aula = {
      titulo: c.titulo,
      disciplina: c.disciplina,
      tema: c.tema ?? '',
      youtube: v.id,
      professor: '',
      data: v.data || '',
      views: null,
      duracao: v.duracao ?? null,
      descricao: (v.descricao || '').split('\n').map((l) => l.trim()).filter(Boolean).join(' ').slice(0, 400),
      resumo: [],
      resumoRevisado: false,
      quiz: [],
      quizRevisado: false,
      referencias: [],
      origem: 'youtube',
    };
    await writeFile(path.join(PASTA_AULAS, `${slug}.json`), `${JSON.stringify(aula, null, 2)}\n`);
    porVideo.set(v.id, { slug, dados: aula });
    resumo.novos.push(`${slug} (${c.disciplina})`);
    if (c.disciplina === 'a-classificar') resumo.aClassificar.push(`${slug} ← ${v.titulo}`);
  }

  console.log(`Já estavam no site: ${resumo.jaExistiam}`);
  resumo.titulosDiferentes.forEach((x) => console.log(`  título diferente → ${x}`));
  console.log(`Vinculados a aulas existentes: ${resumo.vinculados.length}`);
  resumo.vinculados.forEach((x) => console.log(`  ${x}`));
  console.log(`Aulas novas: ${resumo.novos.length}`);
  const porDisc = {};
  for (const n of resumo.novos) { const d = n.match(/\(([^)]+)\)$/)[1]; porDisc[d] = (porDisc[d] ?? 0) + 1; }
  Object.entries(porDisc).sort((a, b) => b[1] - a[1]).forEach(([d, n]) => console.log(`  ${d}: ${n}`));
  console.log(`A classificar no painel: ${resumo.aClassificar.length}`);
  resumo.aClassificar.slice(0, 60).forEach((x) => console.log(`  ${x}`));
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
