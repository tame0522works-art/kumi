// 判型ごとの版面の初期値で、余白が足り、見本が組めて、フォントにない字が出ないか
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseFont } from '../src/font/sfnt.ts'
import { FORMATS, settingsFor } from '../src/layout/formats.ts'
import { typeset } from '../src/layout/typeset.ts'

const font = parseFont(new Uint8Array(readFileSync(new URL('../fonts/BIZUDMincho-Regular.ttf', import.meta.url))))
const source = readFileSync(new URL('../src/samples/sample.txt', import.meta.url), 'utf8')
for (const format of FORMATS) {
  const r = typeset(source, font, settingsFor(format))
  assert.equal(r.overflow, false, `${format.label} の余白が足りない`)
  assert.equal(r.missing.size, 0, `${format.label} でフォントにない字: ${[...r.missing.keys()].join('')}`)
  console.log(`ok   ${format.label} ${format.width}×${format.height}mm ${r.document.pages.length} ページ`)
}
// 余白が足りなければ知らせる
assert.equal(typeset(source, font, { ...settingsFor(FORMATS[0]), linesPerPage: 20 }).overflow, true)
