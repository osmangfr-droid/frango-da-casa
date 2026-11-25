# Frango da Casa

Sistema de gestão do aviário Frango da Casa (vendas, despesas, dívidas, lotes).
Base de dados: Supabase.

## Estrutura
- `public/` — a aplicação já compilada (HTML, JS, CSS, imagens)
- `public/_headers` — cabeçalhos de segurança
- `wrangler.jsonc` — configuração de publicação no Cloudflare

## Publicação
Ligado ao Cloudflare (Workers e Pages). Cada alteração enviada para a branch `main`
é publicada automaticamente. Não há passo de build.
