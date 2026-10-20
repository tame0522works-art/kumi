/**
 * TrueType（glyf 形式）のフォントを読む。
 * 組版と PDF 書き出しに要る分だけ: 文字→字形の対応（cmap）、横・縦の送り幅（hmtx / vmtx）、
 * 縦書き用の字形の置き換え（GSUB の vert）、字形の外形データ（glyf / loca）。
 */

export interface Font {
  readonly bytes: Uint8Array
  readonly unitsPerEm: number
  readonly numGlyphs: number
  readonly ascender: number
  readonly descender: number
  /** 表名 → 位置と長さ */
  readonly tables: ReadonlyMap<string, { offset: number; length: number }>
  glyphId(codePoint: number): number
  advanceWidth(gid: number): number
  /** 縦書きの送り。vmtx がない字形は 1em とする */
  advanceHeight(gid: number): number
  topSideBearing(gid: number): number
  /** 縦書き用の字形（vert）。置き換えがなければ元の gid を返す */
  verticalGlyph(gid: number): number
  /** 外形の範囲。空の字形（空白など）は null */
  bbox(gid: number): { xMin: number; yMin: number; xMax: number; yMax: number } | null
  /** glyf 内の字形データ（複合字形はそのまま） */
  glyphData(gid: number): Uint8Array
  readonly hasVerticalMetrics: boolean
  readonly verticalSubstitutions: number
}

class Reader {
  readonly view: DataView
  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }
  u8(o: number) { return this.view.getUint8(o) }
  u16(o: number) { return this.view.getUint16(o) }
  i16(o: number) { return this.view.getInt16(o) }
  u32(o: number) { return this.view.getUint32(o) }
  tag(o: number) { return String.fromCharCode(this.u8(o), this.u8(o + 1), this.u8(o + 2), this.u8(o + 3)) }
}

export function parseFont(bytes: Uint8Array): Font {
  const r = new Reader(bytes)
  const version = r.u32(0)
  if (version !== 0x00010000 && version !== 0x74727565) {
    throw new Error(version === 0x4f54544f ? 'CFF 形式（OTF）のフォントには対応していません' : 'TrueType のフォントではありません')
  }
  const tables = new Map<string, { offset: number; length: number }>()
  const numTables = r.u16(4)
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    tables.set(r.tag(rec), { offset: r.u32(rec + 8), length: r.u32(rec + 12) })
  }
  const need = (tag: string) => {
    const t = tables.get(tag)
    if (!t) throw new Error(`フォントに ${tag} 表がありません`)
    return t.offset
  }

  const head = need('head')
  const unitsPerEm = r.u16(head + 18)
  const longLoca = r.i16(head + 50) === 1
  const numGlyphs = r.u16(need('maxp') + 4)

  const hhea = need('hhea')
  const numHMetrics = r.u16(hhea + 34)
  const hmtx = need('hmtx')

  const os2 = tables.get('OS/2')?.offset
  // 和文の仮想ボディの上端・下端。OS/2 の sTypo が和文フォントでは em の枠に合わせてある
  const ascender = os2 !== undefined ? r.i16(os2 + 68) : r.i16(hhea + 4)
  const descender = os2 !== undefined ? r.i16(os2 + 70) : r.i16(hhea + 6)

  const vhea = tables.get('vhea')?.offset
  const vmtx = tables.get('vmtx')?.offset
  const numVMetrics = vhea !== undefined ? r.u16(vhea + 34) : 0
  const hasVerticalMetrics = vhea !== undefined && vmtx !== undefined && numVMetrics > 0

  const loca = need('loca')
  const glyf = need('glyf')
  const glyphRange = (gid: number): [number, number] => {
    if (gid < 0 || gid >= numGlyphs) return [0, 0]
    return longLoca ? [r.u32(loca + gid * 4), r.u32(loca + gid * 4 + 4)] : [r.u16(loca + gid * 2) * 2, r.u16(loca + gid * 2 + 2) * 2]
  }

  const cmap = readCmap(r, need('cmap'))
  const vert = tables.has('GSUB') ? readVert(r, need('GSUB')) : new Map<number, number>()

  return {
    bytes,
    unitsPerEm,
    numGlyphs,
    ascender,
    descender,
    tables,
    glyphId: (cp) => cmap(cp),
    advanceWidth(gid) {
      return r.u16(hmtx + Math.min(gid, numHMetrics - 1) * 4)
    },
    advanceHeight(gid) {
      if (!hasVerticalMetrics) return unitsPerEm
      return r.u16(vmtx! + Math.min(gid, numVMetrics - 1) * 4)
    },
    topSideBearing(gid) {
      if (!hasVerticalMetrics) return 0
      // 長い記録のあとは tsb だけが並ぶ
      return gid < numVMetrics ? r.i16(vmtx! + gid * 4 + 2) : r.i16(vmtx! + numVMetrics * 4 + (gid - numVMetrics) * 2)
    },
    verticalGlyph: (gid) => vert.get(gid) ?? gid,
    bbox(gid) {
      const [start, end] = glyphRange(gid)
      if (end <= start) return null
      const o = glyf + start
      return { xMin: r.i16(o + 2), yMin: r.i16(o + 4), xMax: r.i16(o + 6), yMax: r.i16(o + 8) }
    },
    glyphData(gid) {
      const [start, end] = glyphRange(gid)
      return bytes.subarray(glyf + start, glyf + end)
    },
    hasVerticalMetrics,
    verticalSubstitutions: vert.size,
  }
}

/** cmap から Unicode の表を選ぶ。BMP 外も引ける形式 12 を優先し、なければ形式 4 */
function readCmap(r: Reader, cmap: number): (cp: number) => number {
  const n = r.u16(cmap + 2)
  let fmt4: number | undefined
  let fmt12: number | undefined
  for (let i = 0; i < n; i++) {
    const platform = r.u16(cmap + 4 + i * 8)
    const encoding = r.u16(cmap + 6 + i * 8)
    const sub = cmap + r.u32(cmap + 8 + i * 8)
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))
    if (!unicode) continue
    const format = r.u16(sub)
    if (format === 12) fmt12 ??= sub
    if (format === 4) fmt4 ??= sub
  }
  if (fmt12 !== undefined) {
    const sub = fmt12
    const groups = r.u32(sub + 12)
    return (cp) => {
      let lo = 0
      let hi = groups - 1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const g = sub + 16 + mid * 12
        const start = r.u32(g)
        if (cp < start) hi = mid - 1
        else if (cp > r.u32(g + 4)) lo = mid + 1
        else return r.u32(g + 8) + (cp - start)
      }
      return 0
    }
  }
  if (fmt4 === undefined) throw new Error('フォントに Unicode の cmap がありません')
  const sub = fmt4
  const segX2 = r.u16(sub + 6)
  const ends = sub + 14
  const starts = ends + segX2 + 2
  const deltas = starts + segX2
  const rangeOffsets = deltas + segX2
  return (cp) => {
    if (cp > 0xffff) return 0
    for (let i = 0; i < segX2; i += 2) {
      if (cp > r.u16(ends + i)) continue
      const start = r.u16(starts + i)
      if (cp < start) return 0
      const ro = r.u16(rangeOffsets + i)
      if (ro === 0) return (cp + r.i16(deltas + i)) & 0xffff
      const g = r.u16(rangeOffsets + i + ro + (cp - start) * 2)
      return g === 0 ? 0 : (g + r.i16(deltas + i)) & 0xffff
    }
    return 0
  }
}

/**
 * GSUB から縦書き用の置き換え（vert、あれば vrt2 も）を集める。
 * 和文フォントの vert は単純置換（lookup 1）だけなので、それ以外の種類は読まない。
 */
function readVert(r: Reader, gsub: number): Map<number, number> {
  const featureList = gsub + r.u16(gsub + 6)
  const lookupList = gsub + r.u16(gsub + 8)
  const lookups = new Set<number>()
  const featureCount = r.u16(featureList)
  for (let i = 0; i < featureCount; i++) {
    const rec = featureList + 2 + i * 6
    const tag = r.tag(rec)
    if (tag !== 'vert' && tag !== 'vrt2') continue
    const feature = featureList + r.u16(rec + 4)
    const count = r.u16(feature + 2)
    for (let j = 0; j < count; j++) lookups.add(r.u16(feature + 4 + j * 2))
  }
  const map = new Map<number, number>()
  for (const index of lookups) {
    const lookup = lookupList + r.u16(lookupList + 2 + index * 2)
    let type = r.u16(lookup)
    const subCount = r.u16(lookup + 4)
    for (let s = 0; s < subCount; s++) {
      let sub = lookup + r.u16(lookup + 6 + s * 2)
      if (type === 7) {
        // 拡張: 本当の種類と 32 ビットの位置が入っている
        type = r.u16(sub + 2)
        sub = sub + r.u32(sub + 4)
      }
      if (type !== 1) continue
      const format = r.u16(sub)
      const covered = readCoverage(r, sub + r.u16(sub + 2))
      covered.forEach((gid, k) => {
        if (map.has(gid)) return
        map.set(gid, format === 1 ? (gid + r.i16(sub + 4)) & 0xffff : r.u16(sub + 6 + k * 2))
      })
    }
  }
  return map
}

function readCoverage(r: Reader, cov: number): number[] {
  const format = r.u16(cov)
  const count = r.u16(cov + 2)
  const out: number[] = []
  if (format === 1) {
    for (let i = 0; i < count; i++) out.push(r.u16(cov + 4 + i * 2))
  } else {
    for (let i = 0; i < count; i++) {
      const rec = cov + 4 + i * 6
      for (let g = r.u16(rec); g <= r.u16(rec + 2); g++) out.push(g)
    }
  }
  return out
}
