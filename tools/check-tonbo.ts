/**
 * 見本を組んだ PDF を、tonbo（入稿前チェッカー）の検査に通す。全判型 × 4社で指摘が出ないこと。
 * tonbo のソースが隣（../tonbo）にあるときだけ動く（CI では取り込み方を決めるまで飛ばす）。
 * ページ数は白ページを足して 12 にする（見本は2ページで、ポプルスの平とじは 10 ページ以上のため）。
 * しまや出版はサイトにページ数の単位の記載がなく、tonbo が必ず参考の指摘（page-unit-unknown）を出すので除く。
 */
import { existsSync, readFileSync } from 'node:fs'
import { parseFont } from '../src/font/sfnt.ts'
import { FORMATS, settingsFor } from '../src/layout/formats.ts'
import { typeset } from '../src/layout/typeset.ts'
import { writePdf } from '../src/pdf/write.ts'

const tonbo = new URL('../../tonbo/src/', import.meta.url)
if (!existsSync(tonbo)) {
  console.log('check:tonbo skip（../tonbo がない）')
  process.exit(0)
}
const { inspectPdf } = await import(new URL('pdf/inspect.ts', tonbo).href)
const { checkDocument } = await import(new URL('check/rules.ts', tonbo).href)
const { PRINTERS } = await import(new URL('specs/index.ts', tonbo).href)

const font = parseFont(new Uint8Array(readFileSync(new URL('../fonts/BIZUDMincho-Regular.ttf', import.meta.url))))
const source = readFileSync(new URL('../src/samples/sample.txt', import.meta.url), 'utf8')
let failed = 0
for (const format of FORMATS) {
  // 新書は印刷所ごとの寸法なので、その印刷所の仕様でだけ確かめる
  const [formatId, only] = format.id.startsWith('shinsho-') ? ['shinsho', format.id.slice(8)] : [format.id, undefined]
  const { document: doc } = typeset(source, font, settingsFor(format))
  while (doc.pages.length < 12) doc.pages.push({ glyphs: [] })
  const facts = await inspectPdf(await writePdf(doc, font))
  for (const printer of PRINTERS) {
    if (only && printer.id !== only) continue
    const findings = checkDocument(facts, { printer, formatId, part: 'body', ink: 'mono', binding: 'perfect' })
    const list = findings.filter((f: { code: string }) => f.code !== 'page-unit-unknown').map((f: { level: string; code: string }) => `${f.level}:${f.code}`)
    console.log(`${list.length ? 'NG' : 'ok'}   ${format.label} × ${printer.id} ${list.join(' ') || '指摘なし'}`)
    if (list.length) failed++
  }
}
if (failed) process.exit(1)
