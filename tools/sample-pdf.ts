/** 見本の本文を文庫判で組み、out/sample.pdf に書き出す（目での確認と tonbo での検査用） */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseFont } from '../src/font/sfnt.ts'
import { FORMATS, settingsFor } from '../src/layout/formats.ts'
import { typeset } from '../src/layout/typeset.ts'
import { writePdf } from '../src/pdf/write.ts'

const font = parseFont(new Uint8Array(readFileSync(new URL('../fonts/BIZUDMincho-Regular.ttf', import.meta.url))))
const source = readFileSync(new URL('../src/samples/sample.txt', import.meta.url), 'utf8')
const result = typeset(source, font, settingsFor(FORMATS[0]))
const pdf = await writePdf(result.document, font)
mkdirSync(new URL('../out/', import.meta.url), { recursive: true })
writeFileSync(new URL('../out/sample.pdf', import.meta.url), pdf)
console.log(`out/sample.pdf ${(pdf.length / 1024).toFixed(1)}KB, ${result.document.pages.length} ページ`)
if (result.missing.size) console.log('フォントにない字:', [...result.missing.keys()].join(' '))
if (result.overflow) console.log('版面が仕上がりに収まりません')
