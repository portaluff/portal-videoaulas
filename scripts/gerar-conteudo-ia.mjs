#!/usr/bin/env node
// Gera resumo e quiz das videoaulas com a API do Gemini (Google), a partir do link público do YouTube.
//
// - Processa só aulas que têm "youtube" preenchido e ainda estão sem resumo e/ou sem quiz.
// - Nunca apaga nem sobrescreve o que já existe (inclusive o que o professor editou).
// - Tudo o que é gerado entra como "aguardando revisão" (resumoRevisado/quizRevisado = false).
//
// Variáveis de ambiente:
//   GEMINI_API_KEY   (obrigatória) chave criada no Google AI Studio — guardada como secret no GitHub
//   GEMINI_MODEL     (opcional) modelo a usar; padrão abaixo
//   MAX_AULAS        (opcional) máximo de aulas por execução (padrão 8) — a faixa gratuita
//                    aceita até 8 horas de vídeo do YouTube por dia
//   GEMINI_ENDPOINT  (opcional) só para testes
//
// Uso: node scripts/gerar-conteudo-ia.mjs [slug-da-aula ...]

import { readdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_AULAS = path.join(RAIZ, 'src/data/aulas');
const MODELO = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const MAX_AULAS = Number(process.env.MAX_AULAS || 8);
const ENDPOINT = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta';
const CHAVE = process.env.GEMINI_API_KEY;
const PAUSA_MS = Number(process.env.PAUSA_MS ?? 8000);

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    descricao: { type: 'STRING', description: 'Uma frase dizendo do que trata a aula.' },
    resumo: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          rotulo: { type: 'STRING', description: 'Nome curto do tópico (1 a 4 palavras).' },
          texto: { type: 'STRING', description: 'Explicação do tópico em 1 ou 2 frases.' },
        },
        required: ['rotulo', 'texto'],
      },
    },
    quiz: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          pergunta: { type: 'STRING' },
          alternativas: { type: 'ARRAY', items: { type: 'STRING' } },
          indiceCorreta: { type: 'INTEGER', description: 'Posição da alternativa correta, começando em 0.' },
          explicacao: { type: 'STRING', description: 'Por que a resposta correta está certa, segundo a aula.' },
        },
        required: ['pergunta', 'alternativas', 'indiceCorreta', 'explicacao'],
      },
    },
  },
  required: ['descricao', 'resumo', 'quiz'],
};

function montarPedido(aula, disciplina) {
  return `Você apoia o Portal de Videoaulas da Universidade Federal Fluminense (UFF).
Assista à videoaula anexada${disciplina ? ` (disciplina: ${disciplina})` : ''}, título "${aula.titulo}", e produza, em português do Brasil:

1. "descricao": uma frase dizendo do que trata a aula.
2. "resumo": de 4 a 7 tópicos com os pontos-chave, na ordem em que aparecem na aula. Cada tópico tem um rótulo curto e um texto de 1 ou 2 frases.
3. "quiz": de 3 a 5 perguntas de múltipla escolha, cada uma com exatamente 4 alternativas e uma única correta, e uma explicação curta da resposta.

Regras:
- Use somente o que é dito ou mostrado na aula. Não acrescente informações de fora; se algo não ficar claro no vídeo, deixe de fora.
- As perguntas devem testar compreensão dos pontos principais, não detalhes irrelevantes.
- Alternativas erradas devem ser plausíveis para quem estudou o tema, mas claramente erradas segundo a aula.
- Use a terminologia técnica correta da área, como um professor universitário usaria.
- Este material será revisado pelo professor antes de ser publicado.`;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const TEMPO_MAXIMO_MS = Number(process.env.TEMPO_MAXIMO_MS || 20 * 60 * 1000);

// O Gemini pode levar vários minutos para analisar uma aula longa. O fetch do Node desiste após
// 5 minutos sem resposta, então usamos http(s) direto, com tempo máximo configurável (padrão 20 min).
function postarJSON(url, corpo, cabecalhos) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const dados = JSON.stringify(corpo);
    const req = (u.protocol === 'http:' ? http : https).request(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dados), ...cabecalhos },
    }, (res) => {
      let texto = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { texto += c; });
      res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, texto }));
    });
    req.setTimeout(TEMPO_MAXIMO_MS, () => req.destroy(new Error(`sem resposta do Gemini em ${Math.round(TEMPO_MAXIMO_MS / 60000)} minutos`)));
    req.on('error', reject);
    req.end(dados);
  });
}

async function chamarGemini(aula, disciplina, { comResolucaoBaixa = true } = {}) {
  const corpo = {
    contents: [{
      role: 'user',
      parts: [
        { file_data: { file_uri: `https://www.youtube.com/watch?v=${aula.youtube}` } },
        { text: montarPedido(aula, disciplina) },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA,
      temperature: 0.3,
      ...(comResolucaoBaixa ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}),
    },
  };
  const resp = await postarJSON(`${ENDPOINT}/models/${encodeURIComponent(MODELO)}:generateContent`, corpo, { 'x-goog-api-key': CHAVE });
  const texto = resp.texto;
  if (!resp.ok) {
    const erro = new Error(`Gemini respondeu ${resp.status}: ${texto.slice(0, 400)}`);
    erro.status = resp.status;
    throw erro;
  }
  const dados = JSON.parse(texto);
  const parte = dados?.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string');
  if (!parte) throw new Error(`Resposta sem texto: ${texto.slice(0, 400)}`);
  return JSON.parse(parte.text);
}

// Embaralha as alternativas (de forma reproduzível) para a correta não ficar sempre na mesma posição.
function embaralhar(lista, semente) {
  const r = [...lista];
  let s = 0;
  for (const c of semente) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  for (let i = r.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = (s >>> 16) % (i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function validar(gerado, slug) {
  const limpa = (t) => String(t ?? '').trim();
  const resumo = (gerado.resumo ?? [])
    .map((t) => ({ rotulo: limpa(t.rotulo), texto: limpa(t.texto) }))
    .filter((t) => t.rotulo && t.texto)
    .slice(0, 8);

  const quiz = [];
  for (const [n, q] of (gerado.quiz ?? []).entries()) {
    const alternativas = (q.alternativas ?? []).map(limpa).filter(Boolean);
    const indice = Number(q.indiceCorreta);
    if (!limpa(q.pergunta) || alternativas.length < 2 || !Number.isInteger(indice) || indice < 0 || indice >= alternativas.length) continue;
    if (new Set(alternativas).size !== alternativas.length) continue;
    const certa = alternativas[indice];
    const opcoes = embaralhar(alternativas, `${slug}-${n}`);
    quiz.push({ pergunta: limpa(q.pergunta), opcoes, correta: opcoes.indexOf(certa) + 1, explicacao: limpa(q.explicacao) });
  }
  return { descricao: limpa(gerado.descricao), resumo, quiz: quiz.slice(0, 6) };
}

async function carregarDisciplinas() {
  const areas = JSON.parse(await readFile(path.join(RAIZ, 'src/data/areas.json'), 'utf8')).areas;
  return Object.fromEntries(areas.flatMap((a) => a.disciplinas.map((d) => [d.slug, d.nome])));
}

async function main() {
  if (!CHAVE) {
    console.log('GEMINI_API_KEY não configurada — nada a fazer. Veja o README (Resumo e quiz com IA).');
    return;
  }
  const disciplinas = await carregarDisciplinas();
  const pedidos = process.argv.slice(2);
  const arquivos = (await readdir(PASTA_AULAS)).filter((f) => f.endsWith('.json')).sort();

  const pendentes = [];
  for (const arq of arquivos) {
    const slug = arq.replace(/\.json$/, '');
    if (pedidos.length && !pedidos.includes(slug)) continue;
    const aula = JSON.parse(await readFile(path.join(PASTA_AULAS, arq), 'utf8'));
    const faltaResumo = !aula.resumo?.length;
    const faltaQuiz = !aula.quiz?.length;
    if (aula.youtube && (faltaResumo || faltaQuiz) && !aula.iaIgnorar) pendentes.push({ arq, slug, aula, faltaResumo, faltaQuiz });
  }

  console.log(`${pendentes.length} aula(s) com vídeo e sem resumo/quiz. Processando até ${MAX_AULAS} com o modelo ${MODELO}.`);
  let feitas = 0;

  for (const p of pendentes.slice(0, MAX_AULAS)) {
    const { arq, slug, aula } = p;
    console.log(`→ ${slug} (${aula.titulo})`);
    let gerado;
    try {
      try {
        gerado = await chamarGemini(aula, disciplinas[aula.disciplina]);
      } catch (e) {
        if (e.status === 400) gerado = await chamarGemini(aula, disciplinas[aula.disciplina], { comResolucaoBaixa: false });
        else if (!e.status || e.status >= 500) {
          console.error(`  ! ${e.message} — tentando de novo em 30 s`);
          await esperar(30000);
          gerado = await chamarGemini(aula, disciplinas[aula.disciplina]);
        } else throw e;
      }
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      if (e.status === 429) { console.error('  Limite diário da faixa gratuita atingido; o restante fica para a próxima execução.'); break; }
      continue;
    }

    const ok = validar(gerado, slug);
    const agora = new Date().toISOString().slice(0, 10);
    if (p.faltaResumo && ok.resumo.length) { aula.resumo = ok.resumo; aula.resumoRevisado = false; }
    if (p.faltaQuiz && ok.quiz.length) { aula.quiz = ok.quiz; aula.quizRevisado = false; }
    if (!aula.descricao && ok.descricao) aula.descricao = ok.descricao;
    aula.iaGeradoEm = agora;
    aula.iaModelo = MODELO;

    await writeFile(path.join(PASTA_AULAS, arq), `${JSON.stringify(aula, null, 2)}\n`);
    feitas += 1;
    console.log(`  ✓ ${ok.resumo.length} tópico(s) de resumo, ${ok.quiz.length} pergunta(s) — aguardando revisão`);
    await esperar(PAUSA_MS);
  }
  console.log(`Concluído: ${feitas} aula(s) atualizada(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
