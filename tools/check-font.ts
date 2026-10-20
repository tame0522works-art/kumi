/** 同梱の明朝体が縦書きに使えるか（縦の送り幅・vert の置き換え・字形の位置）を確かめる */
import { readFileSync } from 'node:fs'
import { parseFont } from '../src/font/sfnt.ts'

const font = parseFont(new Uint8Array(readFileSync(new URL('../fonts/BIZUDMincho-Regular.ttf', import.meta.url))))
let failed = 0
const expect = (ok: boolean, label: string) => {
  console.log(`${ok ? 'ok  ' : 'NG  '} ${label}`)
  if (!ok) failed++
}

console.log(`unitsPerEm=${font.unitsPerEm} glyphs=${font.numGlyphs} ascender=${font.ascender} descender=${font.descender} vert=${font.verticalSubstitutions}`)
expect(font.hasVerticalMetrics, 'vhea / vmtx がある')
expect(font.verticalSubstitutions > 0, 'GSUB に vert の置き換えがある')

// 縦書きで字形が変わるべき文字（句読点・括弧・長音・ダッシュ・三点リーダ・小書きの仮名）
for (const ch of ['、', '。', '「', '」', '（', '）', 'ー', '―', '…', '〜', 'ぁ', 'ッ']) {
  const gid = font.glyphId(ch.codePointAt(0)!)
  const v = font.verticalGlyph(gid)
  const b = font.bbox(v)
  const box = b ? `x ${b.xMin}..${b.xMax} y ${b.yMin}..${b.yMax}` : '空'
  console.log(`     ${ch} gid ${gid} → ${v} adv ${font.advanceWidth(v)}×${font.advanceHeight(v)} tsb ${font.topSideBearing(v)} ${box}`)
}
for (const ch of ['、', '。', '「', '」', 'ー', '…']) {
  const gid = font.glyphId(ch.codePointAt(0)!)
  expect(gid !== 0 && font.verticalGlyph(gid) !== gid, `${ch} に縦書き用の字形がある`)
}
expect(font.glyphId('𩸽'.codePointAt(0)!) !== 0, 'BMP 外の文字（𩸽）が引ける')
// JIS X 0213 にない字は収録されていない（本文にあれば画面で知らせる）
expect(font.glyphId('𠮷'.codePointAt(0)!) === 0, '収録外の字（𠮷）は 0 になる')
expect(font.glyphId('漢'.codePointAt(0)!) !== 0 && font.verticalGlyph(font.glyphId('漢'.codePointAt(0)!)) === font.glyphId('漢'.codePointAt(0)!), '漢字はそのまま')

if (failed) {
  console.error(`${failed} 件失敗`)
  process.exit(1)
}
