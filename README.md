# Lookbook

Guarda-roupa com IA: cadastre as peças, monte combinações e receba nota para o outfit.

- **Sem login.** As peças e fotos ficam guardadas no próprio celular (IndexedDB).
- **IA** passa por `server.js`, que guarda a chave da Anthropic no servidor. Ela nunca vai dentro do app.
- **iPhone:** abra o link do Render no Safari e toque em Compartilhar > Adicionar à Tela de Início.
- **Android:** instale o `lookbook.apk` da página de Releases. O APK é gerado pelo GitHub Actions a cada push na `main`.

## Estrutura
- `src/lookbook.html`: fonte do app (a mesma do artifact no Claude).
- `tools/build.py`: gera `public/index.html` a partir da fonte. Rode de novo depois de mudar a fonte.
- `public/`: app web (PWA): `shim.js` (armazenamento local + chamada da IA), `sw.js`, manifest e ícones.
- `server.js`: serve o app e o endpoint `POST /api/ai`.

## Variáveis no Render
| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | sua chave da API (obrigatória para a IA) |
| `APP_CODE` | código que o app manda em cada pedido (padrão `lookbook`) |
| `AI_MODEL` | modelo (padrão `claude-haiku-5-5`, o mais barato) |
| `AI_EFFORT` | esforço do modelo (padrão `low`) |
| `LIMIT_PER_IP_HOUR` / `LIMIT_PER_DAY` | limites de uso (padrão 60 por hora por aparelho, 300 por dia no total) |

## Variáveis do GitHub (para o APK)
Em Settings > Secrets and variables > Actions > Variables: `API_URL` = endereço do Render (hoje `https://lookbook-app-zcq4.onrender.com`, já usado por padrão).
