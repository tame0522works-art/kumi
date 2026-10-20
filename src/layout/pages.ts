import type { TypesetDocument } from './types.ts'

/** ページ数のそろえ方。印刷所は、とじ方ごとに「2 の倍数」「4 の倍数」などの決まりを持つ */
export type PageUnit = 1 | 2 | 4

export const PAGE_UNITS: { value: PageUnit; label: string }[] = [
  { value: 1, label: 'そろえない' },
  { value: 2, label: '2 の倍数にする' },
  { value: 4, label: '4 の倍数にする' },
]

/** 最後に白ページを足して、ページ数を unit の倍数にする（元の文書は変えない） */
export function padPages(doc: TypesetDocument, unit: PageUnit): { document: TypesetDocument; blanks: number } {
  const blanks = (unit - (doc.pages.length % unit)) % unit
  if (blanks === 0) return { document: doc, blanks }
  return { document: { ...doc, pages: [...doc.pages, ...Array.from({ length: blanks }, () => ({ glyphs: [] }))] }, blanks }
}
