import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * 公開版に Content Security Policy を入れ、「原稿を端末の外に出さない」をブラウザに守らせる（tonbo と同じ考え方）。
 * GitHub Pages はレスポンスヘッダーを設定できないので <meta> で入れる。開発サーバーは WebSocket を使うので、ビルドのときだけ。
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
  "connect-src 'none'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'kumi-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace('<meta charset="UTF-8" />', `$&\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  }
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  // ほかの作品の開発サーバーと重ならないよう、ポートを固定する
  server: { port: 5197, strictPort: true },
  preview: { port: 5198, strictPort: true },
  plugins: [contentSecurityPolicy(), react()],
})
