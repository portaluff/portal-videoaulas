// Configuração do Astro.
// Enquanto o site estiver em https://portaluff.github.io/portal-videoaulas/, o "base" é /portal-videoaulas.
// Quando o domínio próprio for apontado para o GitHub Pages, defina SITE_URL com o domínio
// e BASE_PATH como "/" (no workflow .github/workflows/deploy.yml) — nenhum outro arquivo muda.
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://portaluff.github.io',
  base: process.env.BASE_PATH ?? '/portal-videoaulas',
  trailingSlash: 'ignore',
});
