// 書き出した PDF から pdf.js で本文を抜き出すと、元の本文（ルビ・傍点を除く）と同じ順で読めるか。
// 親文字の直後にルビが混ざると、PDF の中で本文を検索できなくなる（「古書店は」が「古書店こしょてんは」になる）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseFont } from '../src/font/sfnt.ts'
import { FORMATS, settingsFor } from '../src/layout/formats.ts'
import { typeset } from '../src/layout/typeset.ts'
import { writePdf } from '../src/pdf/write.ts'
import { parseText } from '../src/text/parse.ts'

const font = parseFont(new Uint8Array(readFileSync(new URL('../fonts/BIZUDMincho-Regular.ttf', import.meta.url))))
const source = readFileSync(new URL('../src/samples/sample.txt', import.meta.url), 'utf8') + '\n𩸽《ほっけ》を焼く。'
const pdf = await getDocument({ data: await writePdf(typeset(source, font, settingsFor(FORMATS[0])).document, font), verbosity: 0 }).promise

// 空白は比べない（pdf.js は字の間が空いたところ、縦中横の前後などに空白を補うことがある）
const strip = (s: string) => s.replace(/\s/g, '')

const body: string[] = []
const ruby: string[] = []
for (let i = 1; i <= pdf.numPages; i++) {
  const items = (await (await pdf.getPage(i)).getTextContent()).items.map((it) => ('str' in it ? it.str : ''))
  body.push(items.join(''))
}
for (const para of parseText(source)) {
  for (const inline of para) if (inline.type !== 'text') ruby.push(inline.type === 'ruby' ? inline.ruby : '﹅'.repeat([...inline.text].length))
}
// 縦中横の「！？」は半角2字、単独の !? は全角で組む（PDF にも見たとおりの字で入る）
const asTypeset = (t: string) =>
  t.replace(/[!?！？]+/g, (m) => (m.length === 2 ? m.replace(/！/g, '!').replace(/？/g, '?') : m.replace(/!/g, '！').replace(/\?/g, '？')))
const expected = asTypeset(
  parseText(source)
    .map((p) => p.map((x) => (x.type === 'ruby' ? x.base : x.text)).join(''))
    .join(''),
)
const extracted = strip(body.join(''))

// 本文はページの頭から順に読め、ルビ・傍点はページの終わりにまとめて付く
const rubyChars = new Set(ruby.join(''))
let at = 0
let rest = ''
for (const ch of extracted) {
  if (at < [...strip(expected)].length && ch === [...strip(expected)][at]) at++
  else rest += ch
}
assert.equal(at, [...strip(expected)].length, `本文が途中で崩れている（${at} 字目まで一致: 「${[...strip(expected)].slice(Math.max(0, at - 10), at + 5).join("")}」）`)
assert.ok([...rest].every((c) => rubyChars.has(c)), `本文でもルビでもない字: ${rest}`)
// 親文字の直後にルビが来ていない
for (const s of ['古書店は', '柊さんは', '活版で', '必ず手に入れること', '𩸽を焼く']) assert.ok(extracted.includes(s), `「${s}」が続けて読めない`)
console.log(`check:pdf-text ok（${pdf.numPages} ページ、本文 ${[...strip(expected)].length} 字）`)
