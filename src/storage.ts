/**
 * 本文と設定を、この端末のブラウザ（localStorage）に置いておく。再読み込みやタブを閉じたときに原稿を失わないため。
 * どこへも送らない。読めない・書けない（プライベートウィンドウ、容量の上限など）ときは、保存なしで動く。
 */
import { FORMATS, SETTING_LIMITS, settingsFor } from './layout/formats.ts'
import { PAGE_UNITS, type PageUnit } from './layout/pages.ts'
import type { LayoutSettings } from './layout/typeset.ts'

const KEY = 'kumi:draft:v1'

export interface Draft {
  text: string
  formatId: string
  settings: LayoutSettings
  pageUnit: PageUnit
}

type Field = keyof typeof SETTING_LIMITS

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<Record<keyof Draft, unknown>>
    const format = FORMATS.find((f) => f.id === d.formatId)
    if (typeof d.text !== 'string' || !format) return null
    // 判型の寸法と塗り足しは保存した値を使わず、今の判型の定義から取る（寸法を直したときに古い値が残らないように）
    const settings = settingsFor(format)
    const saved = (d.settings ?? {}) as Record<string, unknown>
    for (const field of Object.keys(SETTING_LIMITS) as Field[]) {
      const v = saved[field]
      const { min, max } = SETTING_LIMITS[field]
      if (typeof v === 'number' && v >= min && v <= max) settings[field] = v
    }
    if (settings.lineAdvance < settings.fontSize) settings.lineAdvance = settings.fontSize
    const pageUnit = PAGE_UNITS.find((u) => u.value === d.pageUnit)?.value ?? 1
    return { text: d.text, formatId: format.id, settings, pageUnit }
  } catch {
    return null
  }
}

/** 書けたら true */
export function saveDraft(d: Draft): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
    return true
  } catch {
    return false
  }
}
