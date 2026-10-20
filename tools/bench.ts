/**
 * 長い原稿を組む時間と PDF を作る時間を測る（README の「実測」）。
 * 見本の本文を繰り返して、文庫で約 100・300 ページの原稿にする。1回空打ちしたあと5回測った中央値。
 */
import { readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { parseFont } from '../src/font/sfnt.ts'
import { FORMATS, settingsFor } from '../src/layout/formats.ts'
import { typeset } from '../src/layout/typeset.ts'
import { writePdf } from '../src/pdf/write.ts'

const font = parseFont(new Uint8Array(readFileSync(new URL('../fonts/BIZUDMincho-Regular.ttf', import.meta.url))))
const sample = readFileSync(new URL('../src/samples/sample.txt', import.meta.url), 'utf8')
const settings = settingsFor(FORMATS[0])

async function measure(fn: () => Promise<unknown> | unknown) {
  await fn()
  const times: number[] = []
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now()
    await fn()
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  return `${Math.round(times[2])} ms（${Math.round(times[0])}〜${Math.round(times[4])}）`
}

console.log(`${cpus()[0].model.trim()} / Node.js ${process.versions.node}`)
console.log('| 原稿 | 文字数 | ページ | 組版 | PDF の作成 | PDF の大きさ |')
console.log('|---|---|---|---|---|---|')
for (const repeat of [50, 150]) {
  const source = Array(repeat).fill(sample).join('\n')
  const chars = [...source.replace(/\s/g, '')].length
  const result = typeset(source, font, settings)
  const pdf = await writePdf(result.document, font)
  const t1 = await measure(() => typeset(source, font, settings))
  const t2 = await measure(() => writePdf(result.document, font))
  console.log(`| 文庫 ${result.document.pages.length}ページ | ${chars.toLocaleString()} 字 | ${result.document.pages.length} | ${t1} | ${t2} | ${(pdf.length / 1024 / 1024).toFixed(2)} MB |`)
}
