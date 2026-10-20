import { FORMATS, settingsFor } from '../layout/formats.ts'
import type { LayoutSettings } from '../layout/typeset.ts'

interface Props {
  formatId: string
  settings: LayoutSettings
  onChange: (formatId: string, settings: LayoutSettings) => void
}

/** 入力できる範囲。小説の本文として現実的な値に絞る */
const LIMITS = {
  fontSize: { min: 6, max: 14, step: 0.5 },
  charsPerLine: { min: 10, max: 60, step: 1 },
  linesPerPage: { min: 4, max: 30, step: 1 },
  lineAdvance: { min: 7, max: 40, step: 0.5 },
} as const

type Field = keyof typeof LIMITS

const LABELS: Record<Field, string> = {
  fontSize: '文字サイズ（pt）',
  charsPerLine: '1行の字数',
  linesPerPage: '1ページの行数',
  lineAdvance: '行送り（pt）',
}

export function SettingsPanel({ formatId, settings, onChange }: Props) {
  const set = (field: Field, raw: string) => {
    const { min, max } = LIMITS[field]
    const v = Number(raw)
    if (!Number.isFinite(v) || raw === '') return
    const next = { ...settings, [field]: Math.min(max, Math.max(min, v)) }
    // 行送りは文字サイズより狭くできない（行が重なる）
    if (next.lineAdvance < next.fontSize) next.lineAdvance = next.fontSize
    onChange(formatId, next)
  }
  return (
    <fieldset className="settings">
      <legend>判型と版面</legend>
      <label>
        判型
        <select
          value={formatId}
          onChange={(e) => {
            const f = FORMATS.find((x) => x.id === e.target.value)!
            onChange(f.id, settingsFor(f))
          }}
        >
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}（{f.width}×{f.height}mm）
            </option>
          ))}
        </select>
      </label>
      {(Object.keys(LIMITS) as Field[]).map((field) => (
        <label key={field}>
          {LABELS[field]}
          <input type="number" inputMode="decimal" {...LIMITS[field]} value={settings[field]} onChange={(e) => set(field, e.target.value)} />
        </label>
      ))}
      <p className="hint">
        行間 {(settings.lineAdvance - settings.fontSize).toFixed(1)}pt（ルビは行間に入ります）。判型を変えると、版面はその判型の初期値に戻ります。
      </p>
    </fieldset>
  )
}
