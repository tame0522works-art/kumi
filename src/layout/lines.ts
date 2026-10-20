/**
 * 行分割と行の調整（JLREQ 3.8）。
 * 1行の字数を超えるところで、禁則に触れないよう次の順で処理する:
 *   1. 句読点が行頭に来るなら、行末の外にぶら下げる
 *   2. 約物の空きを縮めて、次の分割できる位置まで追い込む
 *   3. それも無理なら、前の分割できる位置まで追い出し、足りない分を字間に配る
 * 段落の最終行は配らない（行頭そろえ）。
 */
import { noLineEnd, noLineStart } from './classes.ts'
import { RUBY_SCALE, type Unit } from './units.ts'

export interface LineItem {
  unit: Unit
  /** 行頭からの位置（全角 = 1）。約物の削った空きは含まない */
  start: number
  before: number
  after: number
  /**
   * 行頭・行末でルビが版面の外へはみ出さないよう、親文字の前・後ろに足す空き（全角 = 1）。
   * ルビのはみ出しは前後の仮名に掛けるものなので、行の端（隣の字が別の行）では掛けられない
   */
  lead: number
  trail: number
}

export interface Line {
  items: LineItem[]
  /** 行末の外にぶら下げた句読点 */
  hanging?: LineItem
}

const EPS = 1e-6

export function breakLines(units: Unit[], length: number): Line[] {
  const n = units.length
  const lines: Line[] = []
  const canBreakAt = (k: number) => {
    const a = units[k - 1]
    const b = units[k]
    if (noLineEnd(a.tailClass) || noLineStart(b.headClass)) return false
    // ――・…… は2字で1組なので分けない
    if (a.tailClass === 'inseparable' && b.headClass === 'inseparable' && a.chars[a.chars.length - 1] === b.chars[0]) return false
    return true
  }

  let s = 0
  while (s < n) {
    let k = s + 1
    while (k < n && naturalWidth(units, s, k + 1) <= length + EPS) k++
    if (k === n) {
      lines.push(arrange(units, s, n, length, true))
      break
    }
    if (canBreakAt(k)) {
      lines.push(arrange(units, s, k, length, false))
      s = k
      continue
    }
    const next = units[k]
    const hangable = next.kind === 'char' && (next.headClass === 'period' || next.headClass === 'comma')
    if (hangable && (k + 1 === n || canBreakAt(k + 1))) {
      const line = arrange(units, s, k, length, false)
      line.hanging = { unit: next, start: length, before: 0, after: 0, lead: 0, trail: 0 }
      lines.push(line)
      s = k + 1
      continue
    }
    let j = k + 1
    while (j < n && !canBreakAt(j)) j++
    if (naturalWidth(units, s, j) - shrinkable(units, s, j) <= length + EPS) {
      lines.push(arrange(units, s, j, length, j === n))
      s = j
      continue
    }
    j = k - 1
    while (j > s && !canBreakAt(j)) j--
    if (j <= s) j = k // 分割できる位置がない（とても長い欧文など）ときは字数で切る
    lines.push(arrange(units, s, j, length, false))
    s = j
  }
  return lines
}

/**
 * 行頭・行末の扱いを当てた空き。行頭の始め括弧は天付き（段落の頭は全角のまま）、行末の約物の後ろの空きは取る。
 * 行頭・行末に来たルビ付きの語は、はみ出す分だけ親文字を内側に寄せる
 */
function edgeAki(units: Unit[], s: number, e: number, i: number): { before: number; after: number; lead: number; trail: number } {
  const u = units[i]
  const before = i === s && !u.paragraphHead ? 0 : u.before
  const after = i === e - 1 ? 0 : u.after
  let lead = 0
  let trail = 0
  if (u.kind === 'ruby' && u.rubyOffsets?.length) {
    const first = u.rubyOffsets[0]
    const end = u.rubyOffsets[u.rubyOffsets.length - 1] + RUBY_SCALE
    if (i === s && first < 0) lead = -first
    if (i === e - 1 && end > u.size) trail = end - u.size
  }
  return { before, after, lead, trail }
}

const widthOf = (u: Unit, before: number, after: number) => u.size - (u.akiBefore - before) - (u.akiAfter - after)
/** 行の中で占める長さ（行の端でルビのために足した空きを含む） */
export const itemWidth = (it: LineItem) => widthOf(it.unit, it.before, it.after) + it.lead + it.trail

function naturalWidth(units: Unit[], s: number, e: number): number {
  let w = 0
  for (let i = s; i < e; i++) {
    const { before, after, lead, trail } = edgeAki(units, s, e, i)
    w += widthOf(units[i], before, after) + lead + trail
  }
  return w
}

/** 追い込みで縮められる空き。句点の後ろは縮めない（JLREQ の既定） */
function shrinkable(units: Unit[], s: number, e: number): number {
  let w = 0
  for (let i = s; i < e; i++) {
    const { before, after } = edgeAki(units, s, e, i)
    if (units[i].tailClass !== 'period') w += after
    w += before
  }
  return w
}

function arrange(units: Unit[], s: number, e: number, length: number, last: boolean): Line {
  const items: LineItem[] = []
  for (let i = s; i < e; i++) items.push({ unit: units[i], start: 0, ...edgeAki(units, s, e, i) })
  let diff = length - items.reduce((w, it) => w + itemWidth(it), 0)

  if (diff < -EPS) {
    // 縮める順: 読点の後ろ → 中点の前後 → 終わり括弧の後ろ → 始め括弧の前
    const order: ((it: LineItem) => 'before' | 'after' | null)[] = [
      (it) => (it.unit.tailClass === 'comma' ? 'after' : null),
      (it) => (it.unit.headClass === 'middot' ? 'before' : null),
      (it) => (it.unit.tailClass === 'middot' ? 'after' : null),
      (it) => (it.unit.tailClass === 'close' ? 'after' : null),
      (it) => (it.unit.headClass === 'open' ? 'before' : null),
    ]
    for (const pick of order) {
      const targets = items.map((it) => [it, pick(it)] as const).filter(([it, side]) => side && it[side] > 0) as [LineItem, 'before' | 'after'][]
      const total = targets.reduce((w, [it, side]) => w + it[side], 0)
      if (total <= 0) continue
      const ratio = Math.min(1, -diff / total)
      for (const [it, side] of targets) it[side] -= it[side] * ratio
      diff += total * ratio
      if (diff >= -EPS) break
    }
  }

  // 字間に配る（分離禁止の組の間には配らない）
  const gaps: number[] = []
  if (!last && diff > EPS) {
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1].unit
      const b = items[i].unit
      if (a.tailClass === 'inseparable' && b.headClass === 'inseparable') continue
      gaps.push(i)
    }
  }
  const extra = gaps.length ? diff / gaps.length : 0
  let pos = 0
  let g = 0
  items.forEach((it, i) => {
    if (g < gaps.length && gaps[g] === i) {
      pos += extra
      g++
    }
    it.start = pos
    pos += itemWidth(it)
  })
  return { items }
}

export { widthOf }
