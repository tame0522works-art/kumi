/**
 * 本文を判型・版面の設定に従って組み、ページごとの字形と位置にする。
 * 版面（字数 × 行数）は仕上がりの中央に置く。行は右から左へ進む。
 */
import type { Font } from '../font/sfnt.ts'
import { parseText } from '../text/parse.ts'
import { breakLines, type Line } from './lines.ts'
import { MM, type Page, type PlacedGlyph, type TypesetDocument } from './types.ts'
import { buildUnits, RUBY_SCALE, type Unit } from './units.ts'

export interface LayoutSettings {
  /** 仕上がりの幅・高さ（mm） */
  pageWidth: number
  pageHeight: number
  bleed: number
  /** 文字サイズ（pt） */
  fontSize: number
  /** 1行の字数・1ページの行数 */
  charsPerLine: number
  linesPerPage: number
  /** 行送り（pt）。行間 = 行送り − 文字サイズ。ルビは行間に入る */
  lineAdvance: number
}

export interface TypesetResult {
  document: TypesetDocument
  /** フォントにない文字（豆腐になる）と、その数・最初に出るページ（0 始まり） */
  missing: Map<string, { count: number; page: number }>
  /** 版面の位置と大きさ（pt、仕上がりの左上が原点）。プレビューの枠に使う */
  block: { x: number; y: number; width: number; height: number }
  /** 版面の外の余白（mm）。左右は同じ、天地も同じ */
  margins: { side: number; top: number }
  /** 版面の外の余白が、どこかで MIN_MARGIN より狭い */
  overflow: boolean
}

/** 版面の外に残したい余白（mm）。ノドは綴じで開きにくく、小口・天地は断裁のずれがあるため */
export const MIN_MARGIN = 10

export function typeset(source: string, font: Font, s: LayoutSettings): TypesetResult {
  const width = s.pageWidth * MM
  const height = s.pageHeight * MM
  const size = s.fontSize
  const blockWidth = (s.linesPerPage - 1) * s.lineAdvance + size
  const blockHeight = s.charsPerLine * size
  const right = (width + blockWidth) / 2
  const top = (height - blockHeight) / 2
  const missing: TypesetResult['missing'] = new Map()

  const lines: Line[] = []
  for (const paragraph of parseText(source)) {
    const units = buildUnits(paragraph, font)
    // 空行は1行ぶん空ける
    if (units.length === 0) lines.push({ items: [] })
    else lines.push(...breakLines(units, s.charsPerLine))
  }

  const pages: Page[] = []
  for (let i = 0; i < lines.length; i += s.linesPerPage) {
    const glyphs: PlacedGlyph[] = []
    const page = pages.length
    const onMissing = (ch: string) => {
      const m = missing.get(ch)
      if (m) m.count++
      else missing.set(ch, { count: 1, page })
    }
    lines.slice(i, i + s.linesPerPage).forEach((line, col) => {
      const cx = right - size / 2 - col * s.lineAdvance
      const items = line.hanging ? [...line.items, line.hanging] : line.items
      for (const it of items) {
        // 削った前の空きの分、全角の枠を前に出す
        const boxTop = top + (it.start - (it.unit.akiBefore - it.before)) * size
        placeUnit(glyphs, font, it.unit, cx, boxTop, size, onMissing)
      }
    })
    pages.push({ glyphs })
  }
  if (pages.length === 0) pages.push({ glyphs: [] })

  const margins = { side: (width - blockWidth) / 2 / MM, top: (height - blockHeight) / 2 / MM }
  const overflow = margins.side < MIN_MARGIN || margins.top < MIN_MARGIN
  const block = { x: right - blockWidth, y: top, width: blockWidth, height: blockHeight }
  return { document: { width, height, bleed: s.bleed * MM, pages }, missing, block, margins, overflow }
}

function placeUnit(out: PlacedGlyph[], font: Font, u: Unit, cx: number, boxTop: number, size: number, onMissing: (ch: string) => void) {
  const gidOf = (ch: string, vertical: boolean) => {
    const gid = font.glyphId(ch.codePointAt(0)!)
    if (gid === 0) onMissing(ch)
    return vertical ? font.verticalGlyph(gid) : gid
  }
  const upm = font.unitsPerEm
  const ascent = font.ascender / upm
  const descent = font.descender / upm

  switch (u.kind) {
    case 'char':
      out.push({ gid: gidOf(u.chars[0], true), text: u.chars[0], mode: 'v', x: cx, y: boxTop, size })
      return
    case 'ruby': {
      u.chars.forEach((ch, k) => {
        out.push({ gid: gidOf(ch, true), text: ch, mode: 'v', x: cx, y: boxTop + (u.baseOffsets?.[k] ?? k) * size, size })
      })
      const rs = size * RUBY_SCALE
      const rx = cx + size / 2 + rs / 2
      u.ruby!.forEach((ch, k) => {
        out.push({ gid: gidOf(ch, true), text: ch, mode: 'v', x: rx, y: boxTop + u.rubyOffsets![k] * size, size: rs, ruby: true })
      })
      return
    }
    case 'tcy': {
      const gids = u.chars.map((ch) => gidOf(ch, false))
      const w = gids.reduce((sum, g) => sum + font.advanceWidth(g), 0) / upm
      const scaleX = w > 1 ? 1 / w : 1
      let x = cx - (w * scaleX * size) / 2
      const baseline = boxTop + ascent * size
      gids.forEach((gid, k) => {
        out.push({ gid, text: u.chars[k], mode: 'h', x, y: baseline, size, ...(scaleX !== 1 ? { scaleX } : {}) })
        x += (font.advanceWidth(gid) / upm) * scaleX * size
      })
      return
    }
    case 'latin': {
      // 字の上（ascender）を右に向け、仮想ボディが行の幅にちょうど収まるようにベースラインを置く
      const bx = cx - size / 2 - descent * size
      let y = boxTop
      for (const ch of u.chars) {
        const gid = gidOf(ch, false)
        out.push({ gid, text: ch, mode: 'r', x: bx, y, size })
        y += (font.advanceWidth(gid) / upm) * size
      }
      return
    }
  }
}
