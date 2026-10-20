/**
 * 見開きのプレビュー。右綴じなので奇数ページが左に来る（1ページ目の右は表紙の裏）。
 * 見ている見開きの2ページだけを描く。幅の狭い画面では1ページずつ見せる。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Font } from '../font/sfnt.ts'
import type { TypesetResult } from '../layout/typeset.ts'
import { drawPage } from '../preview/draw.ts'

/** 見開きの番号 → [左のページ, 右のページ]（0 始まり、ないときは null） */
export function spreadPages(spread: number, count: number): [number | null, number | null] {
  const left = spread * 2
  const right = spread * 2 - 1
  return [left < count ? left : null, right >= 0 && right < count ? right : null]
}
export const spreadOf = (page: number) => Math.floor((page + 1) / 2)
export const spreadCount = (pages: number) => spreadOf(pages - 1) + 1

const NARROW = '(max-width: 760px)'
function useNarrow(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = matchMedia(NARROW)
      mq.addEventListener('change', notify)
      return () => mq.removeEventListener('change', notify)
    },
    () => matchMedia(NARROW).matches,
  )
}

interface Props {
  result: TypesetResult
  font: Font
  /** 見ているページ（0 始まり）。見開きではそのページを含む見開きを見せる */
  page: number
  onPage: (page: number) => void
  showBlock: boolean
}

export function Preview({ result, font, page, onPage, showBlock }: Props) {
  const pages = result.document.pages.length
  const single = useNarrow()
  const spread = spreadOf(page)
  const [left, right] = single ? [page, null] : spreadPages(spread, pages)
  const shown = [left, right].filter((p): p is number => p !== null).sort((a, b) => a - b)
  const pageLabel = shown.map((p) => p + 1).join('・')
  const isLast = single ? page >= pages - 1 : spread >= spreadCount(pages) - 1
  const isFirst = page === 0
  // 縦書きの本は左へめくるので、「次へ」は左向き。見開きでは次の見開きの最初のページへ
  const next = () => onPage(Math.min(pages - 1, single ? page + 1 : spread * 2 + 1))
  const prev = () => onPage(Math.max(0, single ? page - 1 : spread * 2 - 2))

  return (
    <section className="preview" aria-label="プレビュー">
      <div
        className={single ? 'spread single' : 'spread'}
        tabIndex={0}
        aria-label={`${pageLabel} ページ（全 ${pages} ページ）。左右の矢印キーでめくる`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') next()
          else if (e.key === 'ArrowRight') prev()
          else return
          e.preventDefault()
        }}
      >
        <PageCanvas result={result} font={font} index={left} showBlock={showBlock} />
        {!single && <PageCanvas result={result} font={font} index={right} showBlock={showBlock} />}
      </div>
      <nav className="pager">
        <button type="button" onClick={next} disabled={isLast}>
          ← 次へ
        </button>
        <span>
          {pageLabel} ページ（全 {pages} ページ）
        </span>
        <button type="button" onClick={prev} disabled={isFirst}>
          前へ →
        </button>
      </nav>
    </section>
  )
}

function PageCanvas({ result, font, index, showBlock }: { result: TypesetResult; font: Font; index: number | null; showBlock: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [cssWidth, setCssWidth] = useState(0)
  const { width, height } = result.document

  useEffect(() => {
    const el = ref.current!
    const ro = new ResizeObserver(() => setCssWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = ref.current!
    if (!cssWidth) return
    const dpr = window.devicePixelRatio || 1
    const scale = (cssWidth / width) * dpr
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (index === null) return
    const style = getComputedStyle(canvas)
    drawPage(ctx, result.document.pages[index], font, {
      scale,
      ink: style.getPropertyValue('--paper-ink') || '#000',
      block: showBlock ? result.block : null,
      guide: style.getPropertyValue('--paper-guide') || '#9cc',
    })
  }, [result, font, index, cssWidth, width, height, showBlock])

  return <canvas ref={ref} className={index === null ? 'page blank' : 'page'} style={{ aspectRatio: `${width} / ${height}` }} aria-hidden="true" />
}
