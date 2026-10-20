/**
 * 組版の結果を canvas に描く。字はフォントの外形（glyf）をそのまま描くので、
 * 書き出す PDF と字形も位置も同じになる（ブラウザの縦書きの組み方には頼らない）。
 */
import { glyphOutline } from '../font/outline.ts'
import type { Font } from '../font/sfnt.ts'
import type { Page } from '../layout/types.ts'

const cache = new WeakMap<Font, Map<number, Path2D>>()

function pathOf(font: Font, gid: number): Path2D {
  let paths = cache.get(font)
  if (!paths) cache.set(font, (paths = new Map()))
  let path = paths.get(gid)
  if (!path) {
    path = new Path2D()
    for (const op of glyphOutline(font, gid)) {
      if (op[0] === 'M') path.moveTo(op[1], op[2])
      else if (op[0] === 'L') path.lineTo(op[1], op[2])
      else if (op[0] === 'Q') path.quadraticCurveTo(op[1], op[2], op[3], op[4])
      else path.closePath()
    }
    paths.set(gid, path)
  }
  return path
}

export interface DrawOptions {
  /** 1pt を何 px で描くか（devicePixelRatio を含む） */
  scale: number
  ink: string
  /** 版面の枠（pt）。null なら描かない */
  block: { x: number; y: number; width: number; height: number } | null
  guide: string
}

export function drawPage(ctx: CanvasRenderingContext2D, page: Page, font: Font, o: DrawOptions) {
  const upm = font.unitsPerEm
  ctx.save()
  ctx.setTransform(o.scale, 0, 0, o.scale, 0, 0)
  if (o.block) {
    ctx.strokeStyle = o.guide
    ctx.lineWidth = 0.5
    ctx.setLineDash([2, 2])
    ctx.strokeRect(o.block.x, o.block.y, o.block.width, o.block.height)
    ctx.setLineDash([])
  }
  ctx.fillStyle = o.ink
  for (const g of page.glyphs) {
    const k = g.size / upm
    // フォントの座標（y が上向き）をページの座標（y が下向き）に移す
    if (g.mode === 'v') {
      // 縦の原点は PDF の W2 と同じく「外形の上端 + tsb」
      const box = font.bbox(g.gid)
      const vy = box ? box.yMax + font.topSideBearing(g.gid) : font.ascender
      const ox = g.x - (font.advanceWidth(g.gid) / 2) * k
      ctx.setTransform(o.scale * k, 0, 0, -o.scale * k, o.scale * ox, o.scale * (g.y + vy * k))
    } else if (g.mode === 'h') {
      const sx = g.scaleX ?? 1
      ctx.setTransform(o.scale * k * sx, 0, 0, -o.scale * k, o.scale * g.x, o.scale * g.y)
    } else {
      // 横倒し: 字の進む向きを下、字の上を右に
      ctx.setTransform(0, o.scale * k, o.scale * k, 0, o.scale * g.x, o.scale * g.y)
    }
    ctx.fill(pathOf(font, g.gid), 'nonzero')
  }
  ctx.restore()
}
