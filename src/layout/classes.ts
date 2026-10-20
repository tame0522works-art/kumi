/**
 * 日本語組版の文字クラス（W3C「日本語組版処理の要件」JLREQ の付録 A を、小説の本文に要る分だけ）。
 * 禁則・約物の空き・ぶら下げの判断は、すべてこの分類から決まる。
 */

export type CharClass =
  | 'open' // cl-01 始め括弧類
  | 'close' // cl-02 終わり括弧類
  | 'hyphen' // cl-03 ハイフン類
  | 'mark' // cl-04 区切り約物（？！）
  | 'middot' // cl-05 中点類
  | 'period' // cl-06 句点類
  | 'comma' // cl-07 読点類
  | 'inseparable' // cl-08 分離禁止文字（―…）
  | 'iteration' // cl-09 繰返し記号
  | 'prolonged' // cl-10 長音記号
  | 'small' // cl-11 小書きの仮名
  | 'space' // cl-14 和字間隔
  | 'kana' // 平仮名・片仮名（ルビのはみ出し先になれる）
  | 'ideographic' // 漢字・その他の全角

const TABLE: [CharClass, string][] = [
  ['open', '「『（［｛〔〈《【〘〖“‘｟'],
  ['close', '」』）］｝〕〉》】〙〗”’｠'],
  ['hyphen', '‐〜゠–～'],
  ['mark', '？！‼⁇⁈⁉'],
  ['middot', '・：；'],
  ['period', '。．'],
  ['comma', '、，'],
  ['inseparable', '—―…‥〳〴〵'],
  ['iteration', 'ヽヾゝゞ々〻'],
  ['prolonged', 'ー'],
  ['small', 'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ'],
  ['space', '　'],
]
const MAP = new Map<string, CharClass>()
for (const [cls, chars] of TABLE) for (const ch of chars) MAP.set(ch, cls)

export function charClass(ch: string): CharClass {
  const c = MAP.get(ch)
  if (c) return c
  const cp = ch.codePointAt(0)!
  if ((cp >= 0x3041 && cp <= 0x309f) || (cp >= 0x30a0 && cp <= 0x30ff)) return 'kana'
  return 'ideographic'
}

/** 行頭に置けない（JIS X 4051 の行頭禁則。小書きの仮名・長音記号も含める強い禁則） */
export function noLineStart(cls: CharClass): boolean {
  return (
    cls === 'close' ||
    cls === 'hyphen' ||
    cls === 'mark' ||
    cls === 'middot' ||
    cls === 'period' ||
    cls === 'comma' ||
    cls === 'iteration' ||
    cls === 'prolonged' ||
    cls === 'small'
  )
}

/** 行末に置けない */
export function noLineEnd(cls: CharClass): boolean {
  return cls === 'open'
}

/** 約物の字面は全角の枠の半分で、残り半分が空き（二分）。前・後ろのどちらが空きか */
export function punctuationAki(cls: CharClass): { before: number; after: number } {
  switch (cls) {
    case 'open':
      return { before: 0.5, after: 0 }
    case 'close':
    case 'period':
    case 'comma':
      return { before: 0, after: 0.5 }
    case 'middot':
      return { before: 0.25, after: 0.25 }
    default:
      return { before: 0, after: 0 }
  }
}
