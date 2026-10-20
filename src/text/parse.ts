/**
 * 小説投稿サイトの記法で書かれた本文を、段落ごとの「文字・ルビ・傍点」の並びにする。
 * 対応する記法:
 * - pixiv: [[rb:漢字 > かんじ]]
 * - カクヨム／青空文庫: ｜漢字《かんじ》（| も可）、親文字が漢字だけなら 漢字《かんじ》
 * - カクヨムの傍点: 《《強調》》
 * - 《 をそのまま書くときは ｜《（カクヨムの決まり）
 * 縦中横などの見た目の判断はここではせず、組版（src/layout/units.ts）で行う。
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'ruby'; base: string; ruby: string }
  | { type: 'emphasis'; text: string }

export type Paragraph = Inline[]

const PIXIV_RUBY = /^\[\[rb:\s*([^\]>]+?)\s*>\s*([^\]]+?)\s*\]\]/
const KANJI = /[\p{Script=Han}々〆ヶ〇]/u
/** 親文字・ルビの長さの上限（カクヨムと同じ）。閉じ忘れの 《 が段落の残りを全部ルビにしてしまうのを防ぐ */
const MAX_BASE = 20
const MAX_RUBY = 50

export function parseText(source: string): Paragraph[] {
  return source.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n').map(parseLine)
}

function parseLine(line: string): Paragraph {
  const out: Inline[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ type: 'text', text })
    text = ''
  }

  let i = 0
  while (i < line.length) {
    const rest = line.slice(i)

    const pixiv = PIXIV_RUBY.exec(rest)
    if (pixiv) {
      flush()
      out.push({ type: 'ruby', base: pixiv[1], ruby: pixiv[2] })
      i += pixiv[0].length
      continue
    }

    if (rest.startsWith('《《')) {
      const end = rest.indexOf('》》', 2)
      if (end > 2) {
        flush()
        out.push({ type: 'emphasis', text: rest.slice(2, end) })
        i += end + 2
        continue
      }
    }

    const ch = rest[0]
    if (ch === '｜' || ch === '|') {
      if (rest[1] === '《') {
        text += '《'
        i += 2
        continue
      }
      const open = rest.indexOf('《', 1)
      const close = open > 0 ? rest.indexOf('》', open + 1) : -1
      const base = open > 0 ? rest.slice(1, open) : ''
      const ruby = close > 0 ? rest.slice(open + 1, close) : ''
      if (base && ruby && [...base].length <= MAX_BASE && [...ruby].length <= MAX_RUBY && !base.includes('｜')) {
        flush()
        out.push({ type: 'ruby', base, ruby })
        i += close + 1
        continue
      }
      // ルビにならない ｜ は本文の文字として残す
    }

    if (ch === '《') {
      const close = rest.indexOf('》', 1)
      const ruby = close > 0 ? rest.slice(1, close) : ''
      const base = trailingKanji(text)
      if (base && ruby && [...ruby].length <= MAX_RUBY) {
        text = text.slice(0, text.length - base.length)
        flush()
        out.push({ type: 'ruby', base, ruby })
        i += close + 1
        continue
      }
    }

    // サロゲートペア（𩸽 など）を割らない
    const cp = line.codePointAt(i)!
    const s = String.fromCodePoint(cp)
    text += s
    i += s.length
  }
  flush()
  return out
}

/** 文字列の末尾に続く漢字（《 の前の親文字の候補）。長すぎるときは親文字と見なさない */
function trailingKanji(text: string): string {
  const chars = [...text]
  let n = 0
  while (n < chars.length && KANJI.test(chars[chars.length - 1 - n])) n++
  if (n === 0 || n > MAX_BASE) return ''
  return chars.slice(chars.length - n).join('')
}
