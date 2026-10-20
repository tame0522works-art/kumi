/**
 * 判型と、判型ごとの版面の初期値。
 * 寸法は tonbo（入稿前チェッカー）が印刷所のサイトから調べた仕様と同じ。新書だけは印刷所ごとに違う。
 * 版面の初期値は、左右（ノド・小口）と天地の余白がそれぞれ 10mm 以上残る組み方にしてある。
 */
import type { LayoutSettings } from './typeset.ts'

export interface Format {
  id: string
  label: string
  width: number
  height: number
  defaults: Pick<LayoutSettings, 'fontSize' | 'charsPerLine' | 'linesPerPage' | 'lineAdvance'>
}

const BUNKO = { fontSize: 9, charsPerLine: 38, linesPerPage: 16, lineAdvance: 15 }
const SHINSHO = { fontSize: 9, charsPerLine: 42, linesPerPage: 16, lineAdvance: 15 }

export const FORMATS: Format[] = [
  { id: 'bunko', label: '文庫', width: 105, height: 148, defaults: BUNKO },
  { id: 'shinsho-nikko', label: '新書（日光企画）', width: 105, height: 175, defaults: SHINSHO },
  { id: 'shinsho-popls', label: '新書（ポプルス）', width: 107, height: 175, defaults: SHINSHO },
  { id: 'shinsho-ryokuyou', label: '新書（緑陽社）', width: 114, height: 182, defaults: SHINSHO },
  { id: 'shinsho-shimaya', label: '新書（しまや出版）', width: 107, height: 172, defaults: SHINSHO },
  { id: 'B6', label: 'B6', width: 128, height: 182, defaults: { fontSize: 9, charsPerLine: 42, linesPerPage: 18, lineAdvance: 16 } },
  { id: 'A5', label: 'A5', width: 148, height: 210, defaults: { fontSize: 10, charsPerLine: 44, linesPerPage: 20, lineAdvance: 17.5 } },
]

/** 本文で一般的な塗り足し（mm）。文字だけの本文でも、印刷所は塗り足し込みの大きさで受け付ける */
export const BLEED = 3

export function settingsFor(format: Format): LayoutSettings {
  return { pageWidth: format.width, pageHeight: format.height, bleed: BLEED, ...format.defaults }
}

/** 版面の数値の入力できる範囲。小説の本文として現実的な値に絞る */
export const SETTING_LIMITS = {
  fontSize: { min: 6, max: 14, step: 0.5 },
  charsPerLine: { min: 10, max: 60, step: 1 },
  linesPerPage: { min: 4, max: 30, step: 1 },
  lineAdvance: { min: 7, max: 40, step: 0.5 },
} as const
