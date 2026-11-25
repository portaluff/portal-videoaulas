// Carrega o conteúdo do portal (arquivos JSON em src/data) e oferece funções de apoio.
// Cada aula é um arquivo em src/data/aulas/<slug>.json — o nome do arquivo vira o endereço da página.
import areasJson from '../data/areas.json';
import trilhasJson from '../data/trilhas.json';

const arquivos = import.meta.glob('../data/aulas/*.json', { eager: true });

export const aulas = Object.entries(arquivos)
  .map(([caminho, mod]) => {
    const dados = mod.default ?? mod;
    const slug = caminho.split('/').pop().replace(/\.json$/, '');
    return { slug, ...dados };
  })
  .sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || a.titulo.localeCompare(b.titulo, 'pt-BR'));

export const areas = areasJson.areas;

export const disciplinas = areas.flatMap((area) =>
  area.disciplinas.map((d) => ({ ...d, area }))
);

export const trilhas = trilhasJson.trilhas;

export const disciplinaPorSlug = Object.fromEntries(disciplinas.map((d) => [d.slug, d]));
export const aulaPorSlug = Object.fromEntries(aulas.map((a) => [a.slug, a]));

/** Monta um endereço interno respeitando o "base" (necessário no GitHub Pages). */
export function url(caminho = '/') {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const p = caminho.startsWith('/') ? caminho : `/${caminho}`;
  return `${base}${p}`;
}

export function formatarNumero(n) {
  return n == null ? '' : n.toLocaleString('pt-BR');
}

export function formatarData(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function corDaAula(aula) {
  return disciplinaPorSlug[aula.disciplina]?.cor ?? '#0B4EA2';
}

export function aulasDaDisciplina(slug) {
  return aulas.filter((a) => a.disciplina === slug);
}

/** Trilhas que contêm a aula, com a posição dela em cada uma. */
export function trilhasDaAula(slug) {
  return trilhas
    .map((t) => ({ trilha: t, indice: t.aulas.indexOf(slug) }))
    .filter((x) => x.indice >= 0);
}

export const temResumo = (a) => Array.isArray(a.resumo) && a.resumo.length > 0;
export const temQuiz = (a) => Array.isArray(a.quiz) && a.quiz.length > 0;
