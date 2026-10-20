/** vite.config.ts の fontAsModule が、フォントを base64 の文字列にして返す */
declare module '*.ttf?b64' {
  const base64: string
  export default base64
}
