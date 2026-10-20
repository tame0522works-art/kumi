import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { download, fileStamp, readTextFile } from './file.ts'
import { loadFont } from './font/load.ts'
import type { Font } from './font/sfnt.ts'
import { FORMATS, settingsFor } from './layout/formats.ts'
import { MIN_MARGIN, typeset, type LayoutSettings } from './layout/typeset.ts'
import { writePdf } from './pdf/write.ts'
import sample from './samples/sample.txt?raw'
import { Preview } from './ui/Preview.tsx'
import { SettingsPanel } from './ui/SettingsPanel.tsx'

export default function App() {
  const [font, setFont] = useState<Font | null>(null)
  const [fontError, setFontError] = useState('')
  const [text, setText] = useState(sample)
  const [formatId, setFormatId] = useState(FORMATS[0].id)
  const [settings, setSettings] = useState<LayoutSettings>(settingsFor(FORMATS[0]))
  const [page, setPage] = useState(0)
  const [showBlock, setShowBlock] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    loadFont().then(setFont, (e: unknown) => setFontError(e instanceof Error ? e.message : String(e)))
  }, [])

  // 入力のたびに組み直すと長い原稿で打鍵が重くなるので、組版は入力より一歩遅れてよい
  const deferredText = useDeferredValue(text)
  const result = useMemo(() => (font ? typeset(deferredText, font, settings) : null), [font, deferredText, settings])
  const pages = result?.document.pages.length ?? 0
  const current = Math.min(page, Math.max(0, pages - 1))

  const save = async () => {
    if (!result || !font) return
    setSaving(true)
    setSaveError('')
    try {
      const pdf = await writePdf(result.document, font)
      download(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), `kumi-${formatId}-${fileStamp()}.pdf`)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main>
      <header>
        <h1>kumi</h1>
        <p>小説の本文を、縦書きの文庫・新書・B6・A5 に組んで、入稿用の PDF にします。原稿は端末の外に送られません。</p>
      </header>

      <div className="workspace">
        <div className="side">
          <section className="source">
            <h2>本文</h2>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              aria-label="本文"
              placeholder="ここに本文を貼り付けます"
            />
            <div className="row">
              <label className="button">
                テキストファイルを開く
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) {
                      setText(await readTextFile(file))
                      setPage(0)
                    }
                  }}
                />
              </label>
              <button type="button" onClick={() => setText(sample)}>
                見本に戻す
              </button>
            </div>
            <p className="hint">
              ルビは pixiv の <code>[[rb:漢字 &gt; かんじ]]</code> と、カクヨム／青空文庫の <code>｜漢字《かんじ》</code> の両方が使えます。傍点は <code>《《強調》》</code>。
            </p>
          </section>

          <SettingsPanel
            formatId={formatId}
            settings={settings}
            onChange={(id, s) => {
              setFormatId(id)
              setSettings(s)
            }}
          />

          {result && (
            <section className="checks" aria-live="polite">
              <h2>確認</h2>
              <ul>
                {result.margins.side < 0 || result.margins.top < 0 ? (
                  <li className="warn">版面が仕上がりの外にはみ出しています。字数・行数・行送り・文字サイズを減らしてください。</li>
                ) : result.overflow ? (
                  <li className="warn">
                    版面の外の余白が {MIN_MARGIN}mm より狭くなっています（左右 {result.margins.side.toFixed(1)}mm・天地 {result.margins.top.toFixed(1)}
                    mm）。綴じや断裁で文字が欠けるおそれがあるので、字数・行数・行送りを減らしてください。
                  </li>
                ) : (
                  <li className="ok">
                    余白 左右 {result.margins.side.toFixed(1)}mm・天地 {result.margins.top.toFixed(1)}mm
                  </li>
                )}
                {result.missing.size > 0 ? (
                  <li className="warn">
                    フォントにない字が {result.missing.size} 種類あります。PDF では白い箱（豆腐）になります。別の字に置き換えるか、画像で入れてください。
                    <ul className="missing">
                      {[...result.missing].map(([ch, m]) => (
                        <li key={ch}>
                          <button type="button" onClick={() => setPage(m.page)} title={`${m.page + 1} ページを見る`}>
                            <span className="glyph">{ch}</span> U+{ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}・{m.count} か所・{m.page + 1} ページ
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : (
                  <li className="ok">すべての字がフォントにあります</li>
                )}
                <li className="ok">{pages} ページ</li>
              </ul>
              <div className="row">
                <button type="button" className="primary" onClick={save} disabled={saving}>
                  {saving ? 'PDF を作っています…' : 'PDF を保存'}
                </button>
                <label className="toggle">
                  <input type="checkbox" checked={showBlock} onChange={(e) => setShowBlock(e.target.checked)} />
                  版面の枠を表示
                </label>
              </div>
              {saveError && <p className="error">PDF を作れませんでした: {saveError}</p>}
              <p className="hint">PDF は仕上がりの周りに塗り足し {settings.bleed}mm を付けた大きさです（文字は版面の中だけ）。</p>
            </section>
          )}
        </div>

        {fontError ? (
          <p className="error">フォントを読み込めませんでした: {fontError}</p>
        ) : result && font ? (
          <Preview result={result} font={font} page={current} onPage={setPage} showBlock={showBlock} />
        ) : (
          <p className="loading">フォントを読み込んでいます…</p>
        )}
      </div>

      <footer>
        <p>
          本文の書体は BIZ UD明朝（SIL Open Font License 1.1）。組版の規則は W3C「日本語組版処理の要件」（JLREQ）に基づきます。
        </p>
      </footer>
    </main>
  )
}
