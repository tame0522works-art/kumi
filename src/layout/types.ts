/**
 * 組版の結果。画面のプレビューと PDF 書き出しは、どちらもこれだけを見て描く。
 * 単位はポイント（1/72 インチ）、原点は仕上がり（塗り足しを含まない）の左上、y は下向き。
 */

export interface PlacedGlyph {
  /** フォントの字形番号（縦書きでは置き換え後） */
  gid: number
  /** 元の文字。PDF の ToUnicode（文字の抜き出し・検索）に使う */
  text: string
  /**
   * 'v' 縦書き: (x, y) は字の仮想ボディの上辺の中央
   * 'h' 横書き（縦中横）: (x, y) はベースラインの左端
   * 'r' 横倒し（縦書きの中の欧文）: (x, y) はベースラインの始点で、ベースラインは下向き、字の上は右を向く
   */
  mode: 'v' | 'h' | 'r'
  x: number
  y: number
  /** 文字サイズ（ポイント） */
  size: number
  /** 横方向の縮め（縦中横が全角に収まらないとき）。1 なら省略 */
  scaleX?: number
  /** ルビ・傍点。PDF では本文の文字の抜き出しに混ぜない */
  ruby?: true
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
