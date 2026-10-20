import { parseFont, type Font } from './sfnt.ts'

let loading: Promise<Font> | undefined

/** 同梱の明朝体（6MB）を読む。画面の表示を待たせないよう、最初に要るときに読み込む */
export function loadFont(): Promise<Font> {
  loading ??= import('../../fonts/BIZUDMincho-Regular.ttf?b64').then(({ default: base64 }) => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return parseFont(bytes)
  })
  return loading
}
