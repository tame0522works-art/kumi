/** 山場の確認用: 仮の組版（1字ずつ縦に並べるだけ）で文庫判の縦書き PDF を書き出す */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseFont } from '../src/font/sfnt.ts'
import { MM, type PlacedGlyph } from '../src/layout/types.ts'
import { writePdf } from '../src/pdf/write.ts'

const font = parseFont(new Uint8Array(readFileSync(new URL('../fonts/BIZUDMincho-Regular.ttf', import.meta.url))))
const text = [
  '　吾輩は猫である。名前はまだ無い。',
  '　どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。',
  '「ちょっと待って……」と彼女は言った――そして、𩸽を焼いた（ほっけ）。',
]
const size = 9
const width = 105 * MM
const height = 148 * MM
const top = 18 * MM
const lineLength = 38
const glyphs: PlacedGlyph[] = []
let column = 0
for (const para of text) {
  const chars = [...para]
  for (let i = 0; i < chars.length; i += lineLength) {
    const x = width - 15 * MM - column * size * 1.75 - size / 2
    chars.slice(i, i + lineLength).forEach((ch, k) => {
      const gid = font.verticalGlyph(font.glyphId(ch.codePointAt(0)!))
      glyphs.push({ gid, text: ch, x, y: top + k * size, size })
    })
    column++
  }
}
const pdf = await writePdf({ width, height, bleed: 3 * MM, pages: [{ glyphs }] }, font)
mkdirSync(new URL('../out/', import.meta.url), { recursive: true })
writeFileSync(new URL('../out/sample.pdf', import.meta.url), pdf)
console.log(`out/sample.pdf ${(pdf.length / 1024).toFixed(1)}KB, ${glyphs.length} 字`)
