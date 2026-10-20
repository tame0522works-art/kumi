/**
 * 組版の結果を、フォントを埋め込んだ縦書きの PDF にする（依存なしの自前実装）。
 * 縦書きは CIDFont の Identity-V で書く。文字は画像ではなく文字のまま残るので、
 * 印刷所の RIP でもきれいに出て、PDF から本文を抜き出したり検索したりもできる。
 */
import { subsetFont } from '../font/subset.ts'
import type { Font } from '../font/sfnt.ts'
import type { TypesetDocument } from '../layout/types.ts'

export async function writePdf(doc: TypesetDocument, font: Font, fontName = 'BIZUDMincho-Regular'): Promise<Uint8Array> {
  const used = new Map<number, string>()
  for (const page of doc.pages) for (const g of page.glyphs) if (!used.has(g.gid)) used.set(g.gid, g.text)

  const w = new PdfBuilder()
  const catalog = w.reserve()
  const pages = w.reserve()
  const type0 = w.reserve()
  const type0h = w.reserve()
  const cidFont = w.reserve()
  const descriptor = w.reserve()
  const fontFile = w.reserve()
  const toUnicode = w.reserve()

  const em = (v: number) => Math.round((v / font.unitsPerEm) * 1000)
  const gids = [...used.keys()].sort((a, b) => a - b)
  // サブセットのフォント名には、6文字の英大文字の印を付ける決まりがある（PDF 32000-1 9.6.4）
  const tag = subsetTag(gids)
  const baseFont = `${tag}+${fontName}`

  // 縦組み用（F1）と、縦中横・横倒しの欧文に使う横組み用（F2）。字形と寸法の本体（CIDFont）は共有する
  w.object(type0, `<< /Type /Font /Subtype /Type0 /BaseFont /${baseFont} /Encoding /Identity-V /DescendantFonts [${cidFont} 0 R] /ToUnicode ${toUnicode} 0 R >>`)
  w.object(type0h, `<< /Type /Font /Subtype /Type0 /BaseFont /${baseFont} /Encoding /Identity-H /DescendantFonts [${cidFont} 0 R] /ToUnicode ${toUnicode} 0 R >>`)

  // 縦の原点は「字の外形の上端 + 上の余白（vmtx の tsb）」。和文の字形ではほぼ全部が仮想ボディの上端にそろうので、
  // 既定値（DW2）をそれにして、外れる字形だけ W2 に書く
  const defaultVy = em(font.ascender)
  const widths: string[] = []
  const vertical: string[] = []
  for (const gid of gids) {
    widths.push(`${gid} [${em(font.advanceWidth(gid))}]`)
    const box = font.bbox(gid)
    const vy = box ? em(box.yMax + font.topSideBearing(gid)) : defaultVy
    const w1 = -em(font.advanceHeight(gid))
    if (vy !== defaultVy || w1 !== -1000) vertical.push(`${gid} ${gid} ${w1} ${em(font.advanceWidth(gid)) / 2} ${vy}`)
  }
  w.object(
    cidFont,
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${baseFont} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
      `/FontDescriptor ${descriptor} 0 R /CIDToGIDMap /Identity /DW 1000 /W [${widths.join(' ')}] /DW2 [${defaultVy} -1000]` +
      (vertical.length ? ` /W2 [${vertical.join(' ')}]` : '') +
      ' >>',
  )
  w.object(
    descriptor,
    `<< /Type /FontDescriptor /FontName /${baseFont} /Flags 6 /FontBBox [0 ${em(font.descender)} 1000 ${em(font.ascender)}] ` +
      `/ItalicAngle 0 /Ascent ${em(font.ascender)} /Descent ${em(font.descender)} /CapHeight ${em(font.ascender)} /StemV 80 /FontFile2 ${fontFile} 0 R >>`,
  )
  const subset = subsetFont(font, gids)
  await w.stream(fontFile, `/Length1 ${subset.length}`, subset)
  await w.stream(toUnicode, '', utf8(toUnicodeCMap(used)))

  const pageRefs: number[] = []
  const media = [0, 0, doc.width + doc.bleed * 2, doc.height + doc.bleed * 2].map(num).join(' ')
  const trim = [doc.bleed, doc.bleed, doc.width + doc.bleed, doc.height + doc.bleed].map(num).join(' ')
  for (const page of doc.pages) {
    const ref = w.reserve()
    const content = w.reserve()
    pageRefs.push(ref)
    const ops: string[] = ['BT']
    let current = ''
    for (const g of page.glyphs) {
      const tf = `/${g.mode === 'v' ? 'F1' : 'F2'} ${num(g.size)} Tf`
      if (tf !== current) {
        ops.push(tf)
        current = tf
      }
      // PDF は y が上向きなので反転する。横倒しは字の進む向きを下、字の上を右に回す
      const x = num(g.x + doc.bleed)
      const y = num(doc.height + doc.bleed - g.y)
      const matrix = g.mode === 'r' ? `0 -1 1 0 ${x} ${y}` : `${num(g.scaleX ?? 1)} 0 0 1 ${x} ${y}`
      ops.push(`${matrix} Tm <${hex4(g.gid)}> Tj`)
    }
    ops.push('ET')
    await w.stream(content, '', utf8(ops.join('\n')))
    w.object(
      ref,
      `<< /Type /Page /Parent ${pages} 0 R /MediaBox [${media}] /TrimBox [${trim}] /BleedBox [${media}] ` +
        `/Resources << /Font << /F1 ${type0} 0 R /F2 ${type0h} 0 R >> >> /Contents ${content} 0 R >>`,
    )
  }
  w.object(pages, `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`)
  w.object(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`)
  return w.finish(catalog)
}

function toUnicodeCMap(used: Map<number, string>): string {
  const entries = [...used].sort((a, b) => a[0] - b[0])
  const lines = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
  ]
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100)
    lines.push(`${chunk.length} beginbfchar`)
    for (const [gid, text] of chunk) lines.push(`<${hex4(gid)}> <${utf16hex(text)}>`)
    lines.push('endbfchar')
  }
  lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end')
  return lines.join('\n')
}

function subsetTag(gids: number[]): string {
  let h = 2166136261
  for (const g of gids) h = Math.imul(h ^ g, 16777619) >>> 0
  let tag = ''
  for (let i = 0; i < 6; i++) {
    tag += String.fromCharCode(65 + (h % 26))
    h = Math.floor(h / 26) + i * 7919
  }
  return tag
}

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0')
const utf16hex = (s: string) => [...s].map((c) => {
  const cp = c.codePointAt(0)!
  if (cp < 0x10000) return hex4(cp)
  const v = cp - 0x10000
  return hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff))
}).join('')
/** 小数は 3 桁まで（0.001pt は印刷で見分けられない） */
const num = (n: number) => String(Math.round(n * 1000) / 1000)
const utf8 = (s: string) => new TextEncoder().encode(s)

class PdfBuilder {
  private chunks: Uint8Array[] = [utf8('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')]
  private length = this.chunks[0].length
  private offsets: number[] = []
  private next = 1

  reserve(): number {
    return this.next++
  }

  object(id: number, body: string) {
    this.raw(id, utf8(`${id} 0 obj\n${body}\nendobj\n`))
  }

  async stream(id: number, dict: string, data: Uint8Array) {
    const packed = await deflate(data)
    const head = utf8(`${id} 0 obj\n<< /Filter /FlateDecode /Length ${packed.length}${dict ? ' ' + dict : ''} >>\nstream\n`)
    const tail = utf8('\nendstream\nendobj\n')
    this.offsets[id] = this.length
    for (const part of [head, packed, tail]) this.push(part)
  }

  finish(root: number): Uint8Array {
    const xref = this.length
    const lines = [`xref\n0 ${this.next}\n0000000000 65535 f \n`]
    for (let id = 1; id < this.next; id++) lines.push(`${String(this.offsets[id]).padStart(10, '0')} 00000 n \n`)
    lines.push(`trailer\n<< /Size ${this.next} /Root ${root} 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
    this.push(utf8(lines.join('')))
    const out = new Uint8Array(this.length)
    let p = 0
    for (const c of this.chunks) {
      out.set(c, p)
      p += c.length
    }
    return out
  }

  private raw(id: number, bytes: Uint8Array) {
    this.offsets[id] = this.length
    this.push(bytes)
  }

  private push(bytes: Uint8Array) {
    this.chunks.push(bytes)
    this.length += bytes.length
  }
}

/** PDF の FlateDecode は zlib 形式なので、CompressionStream の 'deflate'（zlib 形式）がそのまま使える */
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
