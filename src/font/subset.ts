/**
 * PDF に埋め込むため、使った字形だけを残したフォントを作る。
 * 字形の番号（gid）は元のまま残し、使わない字形の中身を空にする。
 * 番号を振り直さないので、PDF 側は CID = gid（CIDToGIDMap /Identity）で済み、組版の結果をそのまま書ける。
 * 6MB のフォントが、小説1冊（数千字種）でも 1〜2MB に収まる。
 */
import { glyphComponents } from './outline.ts'
import type { Font } from './sfnt.ts'

/** 描画に要る表だけを残す（cmap・name・GSUB などは PDF の CIDFontType2 では読まれない） */
const KEEP = ['head', 'hhea', 'maxp', 'hmtx', 'cvt ', 'fpgm', 'prep'] as const

export function subsetFont(font: Font, used: Iterable<number>): Uint8Array {
  const keep = new Set<number>([0]) // 0 番（.notdef）は必須
  const stack = [...used]
  while (stack.length) {
    const gid = stack.pop()!
    if (keep.has(gid) || gid >= font.numGlyphs) continue
    keep.add(gid)
    stack.push(...glyphComponents(font, gid))
  }

  // glyf と loca を作り直す（loca は 32 ビット、字形は 4 バイト境界にそろえる）
  const loca = new Uint8Array((font.numGlyphs + 1) * 4)
  const locaView = new DataView(loca.buffer)
  const parts: Uint8Array[] = []
  let offset = 0
  for (let gid = 0; gid < font.numGlyphs; gid++) {
    locaView.setUint32(gid * 4, offset)
    if (!keep.has(gid)) continue
    const data = font.glyphData(gid)
    parts.push(data)
    offset += data.length
    const pad = (4 - (data.length % 4)) % 4
    if (pad) {
      parts.push(new Uint8Array(pad))
      offset += pad
    }
  }
  locaView.setUint32(font.numGlyphs * 4, offset)
  const glyf = concat(parts, offset)

  const tables = new Map<string, Uint8Array>()
  for (const tag of KEEP) {
    const t = font.tables.get(tag)
    if (t) tables.set(tag, font.bytes.slice(t.offset, t.offset + t.length))
  }
  const head = tables.get('head')!
  new DataView(head.buffer).setUint32(8, 0) // checkSumAdjustment はあとで入れる
  new DataView(head.buffer).setInt16(50, 1) // indexToLocFormat = 32 ビット
  tables.set('loca', loca)
  tables.set('glyf', glyf)
  return buildSfnt(tables)
}

function buildSfnt(tables: Map<string, Uint8Array>): Uint8Array {
  const tags = [...tables.keys()].sort()
  const n = tags.length
  const headerSize = 12 + n * 16
  let size = headerSize
  for (const tag of tags) size += align4(tables.get(tag)!.length)
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  const pow = 2 ** Math.floor(Math.log2(n))
  view.setUint32(0, 0x00010000)
  view.setUint16(4, n)
  view.setUint16(6, pow * 16)
  view.setUint16(8, Math.log2(pow))
  view.setUint16(10, n * 16 - pow * 16)

  let offset = headerSize
  let headOffset = 0
  tags.forEach((tag, i) => {
    const data = tables.get(tag)!
    const rec = 12 + i * 16
    for (let k = 0; k < 4; k++) view.setUint8(rec + k, tag.charCodeAt(k))
    out.set(data, offset)
    view.setUint32(rec + 4, checksum(out, offset, data.length))
    view.setUint32(rec + 8, offset)
    view.setUint32(rec + 12, data.length)
    if (tag === 'head') headOffset = offset
    offset += align4(data.length)
  })
  view.setUint32(headOffset + 8, (0xb1b0afba - checksum(out, 0, out.length)) >>> 0)
  return out
}

function checksum(bytes: Uint8Array, start: number, length: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset)
  let sum = 0
  const end = start + align4(length)
  for (let p = start; p < end; p += 4) {
    sum = (sum + (p + 4 <= bytes.length ? view.getUint32(p) : 0)) >>> 0
  }
  return sum
}

const align4 = (n: number) => (n + 3) & ~3

function concat(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let p = 0
  for (const part of parts) {
    out.set(part, p)
    p += part.length
  }
  return out
}
