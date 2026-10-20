import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
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

/**
 * フォント（.ttf?b64）を、base64 の文字列を返す JS モジュールにする。
 * 公開版は CSP で fetch を禁止しているので、フォントもスクリプトとして読み込ませる（tonbo の CMap と同じ方法）。
 */
function fontAsModule(): Plugin {
  return {
    name: 'kumi-font',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('.ttf?b64')) return
      return `export default ${JSON.stringify(readFileSync(id.slice(0, -4)).toString('base64'))}`
    },
  }
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  // ほかの作品の開発サーバーと重ならないよう、ポートを固定する
  server: { port: 5197, strictPort: true },
  preview: { port: 5198, strictPort: true },
  // 同梱フォント（6MB の TTF を base64 にした 8MB）だけが大きい。最初の画面とは別のチャンクで後から読み込む
  build: { chunkSizeWarningLimit: 9000 },
  plugins: [fontAsModule(), contentSecurityPolicy(), react()],
})
