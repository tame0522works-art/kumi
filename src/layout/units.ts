/**
 * 段落を、行分割の最小単位（1字・ルビの付いた語・縦中横・横倒しの欧文）に分ける。
 * 約物どうしが続くときの空きの詰め（JLREQ 3.1.4）もここで決める。行頭・行末での扱いは行分割の側。
 */
import type { Font } from '../font/sfnt.ts'
import type { Paragraph } from '../text/parse.ts'
import { charClass, punctuationAki, type CharClass } from './classes.ts'

export type UnitKind = 'char' | 'ruby' | 'tcy' | 'latin'

export interface Unit {
  kind: UnitKind
  /** 親文字（ルビ）・縦中横の文字・欧文の文字を1字ずつ */
  chars: string[]
  /** ルビの文字（傍点も ﹅ のルビとして持つ） */
  ruby?: string[]
  headClass: CharClass
  tailClass: CharClass
  /** 字送り方向の長さ（全角 = 1）。約物は空きを含めた全角 */
  size: number
  /** 約物の枠のうち、字面の前・後ろにある空き（固定値） */
  akiBefore: number
  akiAfter: number
  /** 約物が続く詰めのあとに残す空き。行の調整（追い込み）でさらに縮めることがある */
  before: number
  after: number
  paragraphHead: boolean
  /** ルビの親文字・ルビ文字の、単位の先頭からの位置（全角 = 1）。ルビ文字は親文字の半分の大きさ */
  baseOffsets?: number[]
  rubyOffsets?: number[]
}

/** ルビの文字の大きさ（親文字に対して）。小説では二分ルビが一般的 */
export const RUBY_SCALE = 0.5
/** ルビが前後の仮名・約物にはみ出してよい長さ（ルビ1字の半分 = 親文字の四分） */
const RUBY_OVERHANG = RUBY_SCALE / 2

const TOKEN = /[A-Za-z][A-Za-z0-9'’.\-]*|[0-9]+(?:[A-Za-z][A-Za-z0-9'’.\-]*)?|[!?！？]{2,}| +|[\s\S]/gu
const HALF = (s: string) => s.replace(/[！？]/g, (c) => (c === '！' ? '!' : '?'))

export function buildUnits(paragraph: Paragraph, font: Font): Unit[] {
  const units: Unit[] = []
  const latinWidth = (chars: string[]) =>
    chars.reduce((sum, c) => sum + font.advanceWidth(font.glyphId(c.codePointAt(0)!)), 0) / font.unitsPerEm

  const pushChar = (ch: string) => {
    const cls = charClass(ch)
    const aki = punctuationAki(cls)
    units.push(unit('char', [ch], cls, cls, 1, aki.before, aki.after))
  }

  for (const inline of paragraph) {
    if (inline.type === 'ruby') {
      const base = [...inline.base]
      units.push({ ...unit('ruby', base, charClass(base[0]), charClass(base[base.length - 1]), base.length, 0, 0), ruby: [...inline.ruby] })
      continue
    }
    if (inline.type === 'emphasis') {
      // 傍点は1字ずつのルビ（モノルビ）なので、語の途中でも改行できる
      for (const ch of inline.text) {
        const cls = charClass(ch)
        const aki = punctuationAki(cls)
        const u = unit('char', [ch], cls, cls, 1, aki.before, aki.after)
        if (!/\s/.test(ch) && aki.before === 0 && aki.after === 0) {
          u.kind = 'ruby'
          u.ruby = ['﹅']
        }
        units.push(u)
      }
      continue
    }
    for (const [token] of inline.text.matchAll(TOKEN)) {
      const chars = [...token]
      if (/^[0-9]+$/.test(token)) {
        // 2桁までは縦中横、3桁以上は1字ずつ縦中横（全角数字と同じ見え方）にする
        if (chars.length <= 2) units.push(unit('tcy', chars, 'ideographic', 'ideographic', 1, 0, 0))
        else for (const d of chars) units.push(unit('tcy', [d], 'ideographic', 'ideographic', 1, 0, 0))
      } else if (/^[!?！？]{2}$/.test(token)) {
        // 「！？」「!!」は半角2字の縦中横（ライトノベルの組み方）
        units.push(unit('tcy', [...HALF(token)], 'mark', 'mark', 1, 0, 0))
      } else if (/^[!?！？]+$/.test(token)) {
        for (const c of token) pushChar(c === '!' ? '！' : c === '?' ? '？' : c)
      } else if (/^[A-Za-z0-9]/.test(token) || /^ +$/.test(token)) {
        units.push(unit('latin', chars, 'ideographic', 'ideographic', latinWidth(chars), 0, 0))
      } else if (token.codePointAt(0)! < 0x80) {
        // 半角の記号は横倒し（欧文と同じ扱い）
        units.push(unit('latin', chars, 'ideographic', 'ideographic', latinWidth(chars), 0, 0))
      } else {
        pushChar(token)
      }
    }
  }

  if (units.length) units[0].paragraphHead = true
  for (let i = 1; i < units.length; i++) combine(units[i - 1], units[i])
  for (let i = 0; i < units.length; i++) if (units[i].kind === 'ruby') placeRuby(units[i], units[i - 1], units[i + 1])
  return units
}

function unit(kind: UnitKind, chars: string[], headClass: CharClass, tailClass: CharClass, size: number, akiBefore: number, akiAfter: number): Unit {
  return { kind, chars, headClass, tailClass, size, akiBefore, akiAfter, before: akiBefore, after: akiAfter, paragraphHead: false }
}

/** 約物が続くときの空き（JLREQ 3.1.4）: 終わり括弧＋始め括弧は二分、終わり括弧どうし・始め括弧どうしはベタ */
function combine(a: Unit, b: Unit) {
  if (a.after > 0 && b.before > 0) b.before = 0
  if (a.after > 0 && (b.headClass === 'close' || b.headClass === 'period' || b.headClass === 'comma')) a.after = 0
  if (a.tailClass === 'open' && b.before > 0) b.before = 0
}

/**
 * ルビの配置（JLREQ 3.3）。ルビが親文字より短ければ 1:2:1 で配り、
 * 長ければ前後の仮名・約物に四分まではみ出させ、それでも余る分は親文字の間を空ける。
 */
function placeRuby(u: Unit, prev: Unit | undefined, next: Unit | undefined) {
  const n = u.chars.length
  const m = u.ruby!.length
  const rubyLength = m * RUBY_SCALE
  const canOverhang = (v: Unit | undefined) =>
    !!v && v.kind === 'char' && v.headClass !== 'ideographic' && v.headClass !== 'open' && v.tailClass !== 'ideographic'
  const ohBefore = canOverhang(prev) ? RUBY_OVERHANG : 0
  const ohAfter = canOverhang(next) ? RUBY_OVERHANG : 0
  const size = Math.max(n, rubyLength - ohBefore - ohAfter)
  u.size = size
  u.baseOffsets = spread(n, 1, size)
  if (rubyLength <= size) {
    u.rubyOffsets = spread(m, RUBY_SCALE, size)
  } else {
    const excess = rubyLength - size
    const start = ohBefore + ohAfter > 0 ? -excess * (ohBefore / (ohBefore + ohAfter)) : -excess / 2
    u.rubyOffsets = Array.from({ length: m }, (_, k) => start + k * RUBY_SCALE)
  }
}

/** count 個の字（1字の長さ step）を length の中に 1:2:1 の空きで配る */
function spread(count: number, step: number, length: number): number[] {
  const gap = (length - count * step) / count
  return Array.from({ length: count }, (_, k) => gap / 2 + k * (step + gap))
}
