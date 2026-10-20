/** テキストファイルを読む。UTF-8 で読めなければ Shift_JIS（青空文庫の配布形式）として読む */
export async function readTextFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('shift_jis').decode(bytes)
  }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** ファイル名に付ける日時（例: 20261020-1530） */
export function fileStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}
