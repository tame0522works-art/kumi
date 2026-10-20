// README に載せる画面の画像を撮る。公開と同じ設定のビルドを配信した状態（npm run build → npm run preview）で
// `npm run screenshots` を実行する。Edge（なければ Chrome）を画面なしで起動し、Chrome DevTools Protocol で操作する。
// 毎回同じ手順で見本を開くので、アプリを直したら同じ画像を撮り直せる。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Browser, sleep, type Page } from './cdp.ts'

const BASE = process.argv[2] ?? 'http://localhost:5198/'
const OUT = 'docs/images'

async function open(cdp: Page) {
  await cdp.goto(BASE)
  // 同じポートで別の作品が動いていると、その画面を撮ってしまうので、kumi であることを先に確かめる
  const title = await cdp.run<string>(`return document.title`)
  if (title !== 'kumi') throw new Error(`${BASE} で動いているのは kumi ではありません（ページの題名: ${title || 'なし'}）`)
  await cdp.waitFor(`document.querySelector('canvas.page:not(.blank)')`, '最初のプレビュー', 30_000)
  await sleep(300)
}

async function save(cdp: Page, name: string, clip?: { x: number; y: number; width: number; height: number; scale?: number }) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    ...(clip ? { clip: { scale: 1, ...clip }, captureBeyondViewport: true } : {}),
  })
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'))
  console.log(`  ${OUT}/${name}`)
}

const NEXT = `[...document.querySelectorAll('.pager button')].find(b => b.textContent.includes('次へ')).click(); await new Promise(r => setTimeout(r, 300));`

async function main() {
  mkdirSync(OUT, { recursive: true })
  // このブラウザ専用の一時プロファイルを使うので、普段のデータには触れない
  const browser = await Browser.launch()
  try {
    console.log('撮影:')
    // 1. 画面全体: 見本を文庫で組み、2・3ページの見開きを開いたところ
    const cdp = await browser.newPage({ width: 1280, height: 800 })
    await open(cdp)
    await cdp.run(NEXT)
    await save(cdp, 'app.png')

    // 2. 組みの細部: 1ページ目の右上（ルビ・縦中横・約物）を高い解像度で
    const detail = await browser.newPage({ width: 1280, height: 800, deviceScaleFactor: 3 })
    await open(detail)
    const r = await detail.run<{ x: number; y: number; w: number; h: number }>(`
      const c = document.querySelector('canvas.page:not(.blank)');
      const b = c.getBoundingClientRect();
      return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };
    `)
    await save(detail, 'detail.png', { x: r.x + r.w * 0.5, y: r.y + r.h * 0.08, width: r.w * 0.42, height: r.h * 0.3 })

    // 3. スマホ
    const phone = await browser.newPage({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true, touch: true })
    await open(phone)
    await phone.run(`document.querySelector('.preview').scrollIntoView(); await new Promise(r => setTimeout(r, 300));`)
    await save(phone, 'mobile.png')
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
