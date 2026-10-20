/**
 * 組版の結果。画面のプレビューと PDF 書き出しは、どちらもこれだけを見て描く。
 * 単位はポイント（1/72 インチ）、原点は仕上がり（塗り足しを含まない）の左上、y は下向き。
 */

export interface PlacedGlyph {
  /** フォントの字形番号（縦書き用の置き換え後） */
  gid: number
  /** 元の文字。PDF の ToUnicode（文字の抜き出し・検索）に使う */
  text: string
  /** 縦書きでは字の仮想ボディの上辺の中央 */
  x: number
  y: number
  /** 文字サイズ（ポイント） */
  size: number
}

export interface Page {
  glyphs: PlacedGlyph[]
}

export interface TypesetDocument {
  /** 仕上がりの幅・高さ（ポイント） */
  width: number
  height: number
  /** 塗り足し（ポイント）。本文は文字だけなので、PDF の用紙をこの分広げるだけ */
  bleed: number
  pages: Page[]
}

export const MM = 72 / 25.4
