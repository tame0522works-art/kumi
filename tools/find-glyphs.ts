/** 開発用: 見本の組版結果から、指定した文字列の位置（ページ・pt）を出す（pdf-view.html で拡大する範囲を決める） */
import { readFileSync } from 'node:fs'
import { parseFont } from '../src/font/sfnt.ts'
import { FORMATS, settingsFor } from '../src/layout/formats.ts'
import { typeset } from '../src/layout/typeset.ts'

const font = parseFont(new Uint8Array(readFileSync(new URL('../fonts/BIZUDMincho-Regular.ttf', import.meta.url))))
const source = readFileSync(new URL('../src/samples/sample.txt', import.meta.url), 'utf8')
const { document: doc } = typeset(source, font, settingsFor(FORMATS[0]))
for (const needle of process.argv.slice(2)) {
  doc.pages.forEach((p, i) => {
    const text = p.glyphs.map((g) => g.text).join('')
    let at = text.indexOf(needle)
    while (at >= 0) {
      const g = p.glyphs[at]
      console.log(`${needle}: page ${i + 1} x=${g.x.toFixed(1)} y=${g.y.toFixed(1)} (${g.mode})`)
      at = text.indexOf(needle, at + 1)
    }
  })
}
