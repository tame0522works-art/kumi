// 画面操作のテスト。公開と同じ設定でビルドしたもの（CSP 入り）をローカルで配信し、
// 本物のマウス・キーボード操作とファイル選択を送って、画面の働きを確かめる。
// `npm run e2e` で実行する（先に dist-e2e へビルドしてから、このスクリプトが配信とブラウザを立ち上げる）。
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { Browser, sleep, type Page, type Viewport } from './cdp.ts'

const PORT = 4197
const BASE = `http://127.0.0.1:${PORT}/`
const DESKTOP: Viewport = { width: 1280, height: 900 }
const PHONE: Viewport = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, touch: true }
const FAILURES = 'e2e-failures'

class Ui {
  readonly page: Page
  readonly files: string
  constructor(page: Page, files: string) {
    this.page = page
    this.files = files
  }

  async open() {
    await this.page.goto(BASE)
    // フォント（8MB）を読んで、最初のページを描き終えるまで
    await this.page.waitFor(`document.querySelector('canvas.page:not(.blank)')`, '最初のプレビュー', 30_000)
    await sleep(200)
  }

  /** 要素を画面に入れてから、その中央をクリックする */
  async click(selector: string, text?: string) {
    const p = await this.page.run<{ x: number; y: number } | null>(`
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = ${text === undefined ? 'els[0]' : `els.find(e => e.textContent.includes(${JSON.stringify(text)}))`};
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 100));
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    `)
    if (!p) throw new Error(`${selector}${text ? `（${text}）` : ''} が見つかりません`)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await this.page.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 })
    }
    await sleep(150)
  }

  /** 本文の欄を空にして、キーボードで打ち込む */
  async typeText(text: string) {
    await this.click('textarea')
    await this.page.run(`document.querySelector('textarea').select()`)
    await this.page.send('Input.insertText', { text })
    await sleep(400)
  }

  async choose(option: string) {
    await this.page.run(`
      const s = document.querySelector('.settings select');
      const i = [...s.options].findIndex(o => o.textContent.includes(${JSON.stringify(option)}));
      if (i < 0) throw new Error(${JSON.stringify(`判型に ${option} がありません`)});
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, s.options[i].value);
      s.dispatchEvent(new Event('change', { bubbles: true }));
    `)
    await sleep(300)
  }

  /** 版面の数値の欄に、キーボードで打ち込む */
  async typeSetting(label: string, text: string) {
    await this.click('.settings label', label)
    await this.page.run(`document.activeElement.select?.()`)
    await this.page.send('Input.insertText', { text })
    await sleep(300)
  }

  settings() {
    return this.page.run<string[]>(`return [...document.querySelectorAll('.settings input')].map(i => i.value)`)
  }

  checks() {
    return this.page.run<string[]>(`return [...document.querySelectorAll('.checks > ul > li')].map(li => li.className + ':' + li.textContent)`)
  }

  pager() {
    return this.page.run<string>(`return document.querySelector('.pager span').textContent`)
  }

  /** 見開きの左右に何が描かれているか（'page' は描いたページ、'blank' は空き） */
  canvases() {
    return this.page.run<string[]>(`return [...document.querySelectorAll('canvas.page')].map(c => c.classList.contains('blank') ? 'blank' : 'page')`)
  }

  /** canvas に何か描かれているか（白でない画素の数） */
  inked(index: number) {
    return this.page.run<number>(`
      const c = document.querySelectorAll('canvas.page')[${index}];
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    `)
  }

  async chooseFile(path: string) {
    const { result } = await this.page.send('Runtime.evaluate', { expression: `document.querySelector('.source input[type=file]')` })
    await this.page.send('DOM.setFileInputFiles', { files: [path], objectId: result.objectId })
    await sleep(500)
  }

  violations() {
    return this.page.run<string[]>(`return window.__csp`)
  }
}

interface Scenario {
  name: string
  viewport?: Viewport
  download?: boolean
  run(ui: Ui): Promise<void>
}

const scenarios: Scenario[] = [
  {
    name: '見本: 開くと文庫で組まれ、1ページ目が見開きの左に出る',
    async run(ui) {
      await ui.open()
      assert.deepEqual(await ui.canvases(), ['page', 'blank'])
      assert.ok((await ui.inked(0)) > 1000, '1ページ目に字が描かれていない')
      assert.equal(await ui.pager(), '1 ページ（全 3 ページ）')
      const checks = await ui.checks()
      assert.ok(checks[0].startsWith('ok:余白 左右 11.2mm'), checks[0])
      assert.equal(checks[1], 'ok:すべての字がフォントにあります')
      assert.deepEqual(await ui.violations(), [])
    },
  },
  {
    name: 'めくる: ボタンと矢印キーで、次の見開き（右に2ページ・左に3ページ）へ進んで戻る',
    async run(ui) {
      await ui.open()
      await ui.click('.pager button', '次へ')
      assert.equal(await ui.pager(), '2・3 ページ（全 3 ページ）')
      assert.deepEqual(await ui.canvases(), ['page', 'page'])
      assert.ok(await ui.page.run(`return document.querySelector('.pager button').disabled`), '最後の見開きで「次へ」が押せる')
      await ui.click('.spread')
      await ui.page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
      await sleep(200)
      assert.equal(await ui.pager(), '1 ページ（全 3 ページ）')
    },
  },
  {
    name: '入力: 打ち込むと組み直し、フォントにない字を知らせ、押すとそのページへ移る',
    async run(ui) {
      await ui.open()
      await ui.typeText('あ\n'.repeat(20) + '𠮷野家')
      assert.equal(await ui.pager(), '1 ページ（全 2 ページ）')
      const checks = await ui.checks()
      assert.ok(checks[1].startsWith('warn:フォントにない字が 1 種類'), checks[1])
      assert.ok(checks[1].includes('𠮷 U+20BB7・1 か所・2 ページ'), checks[1])
      await ui.click('.missing button')
      assert.equal(await ui.pager(), '2 ページ（全 2 ページ）')
    },
  },
  {
    name: '判型: 変えると版面がその初期値に戻り、行数を増やしすぎると余白の不足を知らせる',
    async run(ui) {
      await ui.open()
      await ui.choose('A5')
      assert.deepEqual(await ui.settings(), ['10', '44', '20', '17.5'])
      await ui.typeSetting('1ページの行数', '24')
      assert.ok((await ui.checks())[0].startsWith('warn:版面の外の余白が 10mm より狭く'))
      await ui.typeSetting('1ページの行数', '30')
      assert.ok((await ui.checks())[0].startsWith('warn:版面が仕上がりの外にはみ出しています'))
      await ui.choose('新書（緑陽社）')
      assert.deepEqual(await ui.settings(), ['9', '42', '16', '15'])
      assert.ok((await ui.checks())[0].startsWith('ok:'))
    },
  },
  {
    name: 'ファイル: Shift_JIS のテキスト（青空文庫の配布形式）を開ける',
    async run(ui) {
      await ui.open()
      const file = join(ui.files, 'aozora.txt')
      // 「吾輩《わがはい》は猫である。名前はまだ無い。」を Shift_JIS で
      writeFileSync(file, Buffer.from('8ce19479817382ed82aa82cd82a2817482cd944c82c582a082e9814296bc914f82cd82dc82be96b382a28142', 'hex'))
      await ui.chooseFile(file)
      assert.equal(await ui.page.run(`return document.querySelector('textarea').value`), '吾輩《わがはい》は猫である。名前はまだ無い。')
      assert.equal(await ui.pager(), '1 ページ（全 1 ページ）')
    },
  },
  {
    name: 'PDF: 保存すると、縦書きの字体を埋め込んだ文庫の PDF ができる',
    download: true,
    async run(ui) {
      await ui.open()
      await ui.click('button.primary')
      let name = ''
      for (let i = 0; i < 100 && !name; i++) {
        name = readdirSync(ui.files).find((f) => f.endsWith('.pdf')) ?? ''
        if (!name) await sleep(100)
      }
      assert.match(name, /^kumi-bunko-\d{8}-\d{4}\.pdf$/)
      const pdf = readFileSync(join(ui.files, name))
      const text = pdf.toString('latin1')
      assert.ok(text.startsWith('%PDF-1.7'))
      assert.ok(text.includes('/Encoding /Identity-V'))
      assert.ok(text.includes('/FontFile2'))
      assert.ok(text.includes('/Count 3'))
      // 文庫 105×148mm ＋ 塗り足し 3mm（111×154mm）
      assert.ok(text.includes('/MediaBox [0 0 314.646 436.535]'))
      // 本文の抜き出しに使う ToUnicode に、見本の字（駅 U+99C5）が入っている
      const streams = [...text.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => {
        try {
          return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')
        } catch {
          return ''
        }
      })
      assert.ok(streams.some((s) => s.includes('beginbfchar') && s.includes('<99C5>')))
    },
  },
  {
    name: 'スマホ: 1ページずつ表示し、横にはみ出さない',
    viewport: PHONE,
    async run(ui) {
      await ui.open()
      assert.deepEqual(await ui.canvases(), ['page'])
      await ui.click('.pager button', '次へ')
      assert.equal(await ui.pager(), '2 ページ（全 3 ページ）')
      const { scrollW, clientW } = await ui.page.run<{ scrollW: number; clientW: number }>(
        `return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }`,
      )
      assert.equal(scrollW, clientW)
    },
  },
  {
    name: '外への通信は、ブラウザが拒否する',
    async run(ui) {
      await ui.open()
      const blocked = await ui.page.run<boolean>(`try { await fetch('https://example.com/'); return false } catch { return true }`)
      assert.ok(blocked)
      await sleep(200)
      assert.ok((await ui.violations()).some((v) => v.startsWith('connect-src')))
    },
  },
]

// ---- 実行 ----

let server: ChildProcess | null = null

async function startServer() {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) return
    await sleep(100)
  }
  await stopServer()
  throw new Error('テスト用のサーバーが起動しませんでした')
}

async function stopServer() {
  if (!server) return
  const s = server
  server = null
  const exited = new Promise((r) => s.once('exit', r))
  s.kill()
  await exited
}

async function main() {
  const only = process.argv[2]
  await startServer()
  const browser = await Browser.launch(9337)
  let failed = 0
  try {
    for (const s of scenarios.filter((s) => !only || s.name.includes(only))) {
      const files = mkdtempSync(join(tmpdir(), 'kumi-e2e-'))
      const page = await browser.newPage(s.viewport ?? DESKTOP, s.download ? { downloadPath: files } : {})
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));`,
      })
      const ui = new Ui(page, files)
      const t0 = Date.now()
      try {
        await s.run(ui)
        console.log(`  ✓ ${s.name}（${((Date.now() - t0) / 1000).toFixed(1)}秒）`)
      } catch (e) {
        failed++
        console.log(`  ✗ ${s.name}\n      ${e instanceof Error ? e.message : String(e)}`)
        mkdirSync(FAILURES, { recursive: true })
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => ({ data: '' }))
        if (data) writeFileSync(join(FAILURES, `${scenarios.indexOf(s) + 1}.png`), Buffer.from(data, 'base64'))
      } finally {
        await page.send('Page.close').catch(() => {})
        rmSync(files, { recursive: true, force: true })
      }
    }
  } finally {
    await browser.close()
    await stopServer()
  }
  if (failed > 0) {
    console.log(`\n${failed} 件失敗しました（失敗時の画面: ${FAILURES}/）`)
    process.exit(1)
  }
  console.log('\ne2e OK')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
