/**
 * glyf の外形を、canvas の Path2D や SVG に渡せる命令列にする。
 * 画面のプレビューもフォントの字形をそのまま描くので、PDF と字形・位置がずれない。
 * 座標はフォント単位で、y は上向き（描くときに反転する）。
 */
import type { Font } from './sfnt.ts'

export type PathOp = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number] | ['Z']

export function glyphOutline(font: Font, gid: number, depth = 0): PathOp[] {
  const data = font.glyphData(gid)
  if (data.length < 10 || depth > 8) return []
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const contours = view.getInt16(0)
  return contours >= 0 ? simpleOutline(view, contours) : compositeOutline(font, view, depth)
}

function simpleOutline(view: DataView, contours: number): PathOp[] {
  const ends: number[] = []
  for (let i = 0; i < contours; i++) ends.push(view.getUint16(10 + i * 2))
  const points = contours ? ends[contours - 1] + 1 : 0
  let p = 10 + contours * 2
  p += 2 + view.getUint16(p) // 命令（ヒンティング）は使わない

  const flags = new Uint8Array(points)
  for (let i = 0; i < points; ) {
    const f = view.getUint8(p++)
    flags[i++] = f
    if (f & 8) {
      let repeat = view.getUint8(p++)
      while (repeat-- > 0) flags[i++] = f
    }
  }
  const readCoords = (short: number, same: number) => {
    const out = new Int32Array(points)
    let v = 0
    for (let i = 0; i < points; i++) {
      const f = flags[i]
      if (f & short) {
        const d = view.getUint8(p++)
        v += f & same ? d : -d
      } else if (!(f & same)) {
        v += view.getInt16(p)
        p += 2
      }
      out[i] = v
    }
    return out
  }
  const xs = readCoords(2, 16)
  const ys = readCoords(4, 32)

  const ops: PathOp[] = []
  let start = 0
  for (const end of ends) {
    contour(ops, xs, ys, flags, start, end)
    start = end + 1
  }
  return ops
}

/** 1本の輪郭。TrueType は曲線外の点が続くと、その中点に曲線上の点を補う */
function contour(ops: PathOp[], xs: Int32Array, ys: Int32Array, flags: Uint8Array, start: number, end: number) {
  const n = end - start + 1
  if (n < 2) return
  const on = (i: number) => (flags[start + ((i + n) % n)] & 1) === 1
  const x = (i: number) => xs[start + ((i + n) % n)]
  const y = (i: number) => ys[start + ((i + n) % n)]

  // 曲線上の点から始める。全部が曲線外なら、最初の2点の中点から
  let first = 0
  while (first < n && !on(first)) first++
  let sx: number
  let sy: number
  if (first === n) {
    sx = (x(0) + x(1)) / 2
    sy = (y(0) + y(1)) / 2
    first = 0
  } else {
    sx = x(first)
    sy = y(first)
  }
  ops.push(['M', sx, sy])
  let cx: number | null = null
  let cy = 0
  for (let k = 1; k <= n; k++) {
    const i = first + k
    const px = k === n ? sx : x(i)
    const py = k === n ? sy : y(i)
    const isOn = k === n || on(i)
    if (isOn) {
      if (cx === null) ops.push(['L', px, py])
      else ops.push(['Q', cx, cy, px, py])
      cx = null
    } else if (cx === null) {
      cx = px
      cy = py
    } else {
      const mx = (cx + px) / 2
      const my = (cy + py) / 2
      ops.push(['Q', cx, cy, mx, my])
      cx = px
      cy = py
    }
  }
  if (cx !== null) ops.push(['Q', cx, cy, sx, sy])
  ops.push(['Z'])
}

/** 複合字形（部品を組み合わせた字形）。和文フォントでは部首の使い回しなどに使われる */
function compositeOutline(font: Font, view: DataView, depth: number): PathOp[] {
  const ops: PathOp[] = []
  let p = 10
  for (;;) {
    const flags = view.getUint16(p)
    const component = view.getUint16(p + 2)
    p += 4
    let dx: number
    let dy: number
    if (flags & 1) {
      dx = view.getInt16(p)
      dy = view.getInt16(p + 2)
      p += 4
    } else {
      dx = view.getInt8(p)
      dy = view.getInt8(p + 1)
      p += 2
    }
    // 点の番号で合わせる指定（ARGS_ARE_XY_VALUES が立っていない）は和文フォントでまず使われないので、ずらさずに置く
    if (!(flags & 2)) dx = dy = 0
    let a = 1, b = 0, c = 0, d = 1
    const f2dot14 = (o: number) => view.getInt16(o) / 16384
    if (flags & 8) {
      a = d = f2dot14(p)
      p += 2
    } else if (flags & 0x40) {
      a = f2dot14(p)
      d = f2dot14(p + 2)
      p += 4
    } else if (flags & 0x80) {
      a = f2dot14(p)
      b = f2dot14(p + 2)
      c = f2dot14(p + 4)
      d = f2dot14(p + 6)
      p += 8
    }
    const tx = (x: number, y: number): [number, number] => [a * x + c * y + dx, b * x + d * y + dy]
    for (const op of glyphOutline(font, component, depth + 1)) {
      if (op[0] === 'M' || op[0] === 'L') ops.push([op[0], ...tx(op[1], op[2])])
      else if (op[0] === 'Q') ops.push(['Q', ...tx(op[1], op[2]), ...tx(op[3], op[4])])
      else ops.push(op)
    }
    if (!(flags & 0x20)) break
  }
  return ops
}

/** 複合字形が使う部品の gid（サブセットに含める必要がある） */
export function glyphComponents(font: Font, gid: number): number[] {
  const data = font.glyphData(gid)
  if (data.length < 10) return []
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (view.getInt16(0) >= 0) return []
  const out: number[] = []
  let p = 10
  for (;;) {
    const flags = view.getUint16(p)
    out.push(view.getUint16(p + 2))
    p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0)
    if (!(flags & 0x20)) break
  }
  return out
}
