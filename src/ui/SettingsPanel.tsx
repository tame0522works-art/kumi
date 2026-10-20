import { useState } from 'react'
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
  const commit = (field: Field, v: number) => {
    const next = { ...settings, [field]: v }
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
        <NumberField key={field} label={LABELS[field]} value={settings[field]} {...LIMITS[field]} onCommit={(v) => commit(field, v)} />
      ))}
      <p className="hint">
        行間 {(settings.lineAdvance - settings.fontSize).toFixed(1)}pt（ルビは行間に入ります）。判型を変えると、版面はその判型の初期値に戻ります。
      </p>
    </fieldset>
  )
}

/**
 * 数値の欄。打っている途中の値（「44」を打つときの「4」や、消して空にしたところ）は範囲に直さずそのまま見せ、
 * 範囲に収まった時点で組版に反映する。範囲の外や空のまま欄を離れたら（Enter でも）、範囲に収めるか元に戻す。
 * 打っている途中の値は、打ち始めた（最後に反映した）値と組で持ち、判型の切り替えなどで外から値が変わったら捨てる。
 */
function NumberField({ label, value, min, max, step, onCommit }: { label: string; value: number; min: number; max: number; step: number; onCommit: (v: number) => void }) {
  const [held, setHeld] = useState<{ text: string; base: number } | null>(null)
  const draft = held && held.base === value ? held.text : null
  const settle = () => {
    if (draft === null) return
    const v = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(v)) onCommit(Math.min(max, Math.max(min, v)))
    setHeld(null)
  }
  const invalid = draft !== null && !(draft.trim() !== '' && Number(draft) >= min && Number(draft) <= max)
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const raw = e.target.value
          const v = Number(raw)
          const valid = raw.trim() !== '' && v >= min && v <= max
          // 「9.」のような打ちかけも、反映した値（9）と組で持っておけば、そのまま見せ続けられる
          setHeld({ text: raw, base: valid ? v : value })
          if (valid) onCommit(v)
        }}
        onBlur={settle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') settle()
        }}
      />
      {invalid && (
        <span className="range">
          {min}〜{max}
        </span>
      )}
    </label>
  )
}
