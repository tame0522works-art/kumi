// 行分割と行の調整が JLREQ の処理どおりになるか（禁則・ぶら下げ・追い込み・追い出し・約物の詰め・ルビ・縦中横）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseFont } from '../src/font/sfnt.ts'
import { breakLines, widthOf, type Line } from '../src/layout/lines.ts'
import { buildUnits } from '../src/layout/units.ts'
import { parseText } from '../src/text/parse.ts'

const font = parseFont(new Uint8Array(readFileSync(new URL('../fonts/BIZUDMincho-Regular.ttf', import.meta.url))))
const units = (s: string) => buildUnits(parseText(s)[0], font)
const lay = (s: string, n: number) => breakLines(units(s), n)
const text = (l: Line) => l.items.map((it) => it.unit.chars.join('')).join('') + (l.hanging ? `|${l.hanging.unit.chars[0]}` : '')
const texts = (s: string, n: number) => lay(s, n).map(text)
const lineLength = (l: Line) => {
  const last = l.items[l.items.length - 1]
  return last.start + widthOf(last.unit, last.before, last.after)
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`)

// 字数で折り返す。段落の最終行はそろえない
assert.deepEqual(texts('あいうえおかきくけこ', 4), ['あいうえ', 'おかきく', 'けこ'])

// 句読点が行頭に来るなら、行末の外にぶら下げる
{
  const lines = lay('あいうえ。か', 4)
  assert.deepEqual(lines.map(text), ['あいうえ|。', 'か'])
  close(lines[0].hanging!.start, 4)
}

// 終わり括弧が行頭に来るなら、始め括弧の空きを詰めて追い込む
{
  const lines = lay('あいう「えお」かき', 6)
  assert.deepEqual(lines.map(text), ['あいう「えお」', 'かき'])
  close(lineLength(lines[0]), 6)
}

// 追い込めなければ追い出し、残りを字間に配って行末をそろえる
{
  const lines = lay('あいうえお」か', 5)
  assert.deepEqual(lines.map(text), ['あいうえ', 'お」か'])
  close(lineLength(lines[0]), 5)
  close(lines[0].items[1].start, 1 + 1 / 3)
}

// 小書きの仮名・長音は行頭に置かない（強い禁則）
assert.deepEqual(texts('あいうえっか', 4), ['あいう', 'えっか'])
assert.deepEqual(texts('あいうえーか', 4), ['あいう', 'えーか'])

// ――・…… は2字で1組なので分けない（追い出す）
assert.deepEqual(texts('あいう――えお', 4), ['あいう', '――えお'])
assert.deepEqual(texts('あいう……えお', 4), ['あいう', '……えお'])

// 始め括弧は行末に置かない
assert.deepEqual(texts('あいう「えお」', 4), ['あいう', '「えお」'])

// 約物の詰め: 」「 の間は二分、。」 の間はベタ
{
  const [line] = lay('あ」「い', 10)
  assert.deepEqual(line.items.map((it) => it.start), [0, 1, 2, 2.5])
  const [line2] = lay('あ。」い', 10)
  assert.deepEqual(line2.items.map((it) => it.start), [0, 1, 1.5, 2.5])
}
// 行頭の始め括弧は天付き、段落の頭は全角のまま
{
  const lines = lay('あいう「え」', 3)
  assert.deepEqual(lines.map(text), ['あいう', '「え」'])
  assert.equal(lines[1].items[0].before, 0)
  assert.equal(lay('「え」', 10)[0].items[0].before, 0.5)
}

// ルビ: 親文字と同じ長さならそのまま、長ければ前後の仮名に四分まではみ出す
{
  const [tokyo] = units('｜東京《とうけい》')
  assert.equal(tokyo.size, 2)
  assert.deepEqual(tokyo.rubyOffsets, [0, 0.5, 1, 1.5])
  const [kan] = units('漢《かんじ》')
  assert.equal(kan.size, 1.5) // 前後に仮名がないので、親文字の前後を空ける
  assert.deepEqual(kan.baseOffsets, [0.25])
  const kan2 = units('あ漢《かんじ》い')[1]
  assert.equal(kan2.size, 1)
  assert.deepEqual(kan2.rubyOffsets, [-0.25, 0.25, 0.75])
}
// 傍点は1字ずつ付き、途中で改行できる
assert.deepEqual(texts('あいう《《ぜったい》》', 5), ['あいうぜっ', 'たい'])
assert.equal(units('《《強調》》')[0].ruby?.[0], '﹅')

// 縦中横: 2桁までは1つに、3桁以上は1字ずつ。！？ は半角2字で縦中横
assert.deepEqual(units('第12話').map((u) => [u.kind, u.chars.join('')]), [['char', '第'], ['tcy', '12'], ['char', '話']])
assert.deepEqual(units('123').map((u) => u.kind), ['tcy', 'tcy', 'tcy'])
assert.deepEqual(units('え！？').map((u) => [u.kind, u.chars.join('')]), [['char', 'え'], ['tcy', '!?']])
assert.deepEqual(units('え！').map((u) => u.chars.join('')), ['え', '！'])
// 欧文は単語ごとに横倒し、単語の間で改行できる
assert.deepEqual(units('Hello world').map((u) => [u.kind, u.chars.join('')]), [['latin', 'Hello'], ['latin', ' '], ['latin', 'world']])

console.log('check:lines ok')

// 見本の本文すべてで: 段落の最終行以外は行末がそろい、行頭禁則の字が行頭に来ず、行末に始め括弧が残らない
{
  const { noLineStart, noLineEnd } = await import('../src/layout/classes.ts')
  const source = readFileSync(new URL('../src/samples/sample.txt', import.meta.url), 'utf8')
  let count = 0
  for (const para of parseText(source)) {
    if (!para.length) continue
    const lines = breakLines(buildUnits(para, font), 38)
    lines.forEach((l, i) => {
      count++
      if (i < lines.length - 1) close(lineLength(l), 38)
      if (i > 0) assert.ok(!noLineStart(l.items[0].unit.headClass), `行頭禁則: ${text(l)}`)
      assert.ok(!noLineEnd(l.items[l.items.length - 1].unit.tailClass), `行末禁則: ${text(l)}`)
    })
  }
  assert.ok(count > 20)
}
console.log('check:lines sample ok')
