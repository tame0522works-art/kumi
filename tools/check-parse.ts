// 記法の読み取りが、pixiv・カクヨム／青空文庫の書き方どおりになるか
import assert from 'node:assert/strict'
import { parseText, type Inline } from '../src/text/parse.ts'

const one = (s: string): Inline[] => parseText(s)[0]
const t = (text: string): Inline => ({ type: 'text', text })
const r = (base: string, ruby: string): Inline => ({ type: 'ruby', base, ruby })

// pixiv
assert.deepEqual(one('彼は[[rb:魔法使い > まほうつかい]]だ'), [t('彼は'), r('魔法使い', 'まほうつかい'), t('だ')])
assert.deepEqual(one('[[rb:東京>とうきょう]]'), [r('東京', 'とうきょう')])

// カクヨム／青空文庫: 縦棒で親文字を区切る（全角・半角どちらも）
assert.deepEqual(one('これは｜魔法使い《まほうつかい》です'), [t('これは'), r('魔法使い', 'まほうつかい'), t('です')])
assert.deepEqual(one('|Ｘ線《エックスせん》'), [r('Ｘ線', 'エックスせん')])
// 縦棒なしは、《 の直前に続く漢字が親文字
assert.deepEqual(one('私の名は山田太郎《やまだたろう》です'), [t('私の名は'), r('山田太郎', 'やまだたろう'), t('です')])
// 直前が漢字でなければルビにしない
assert.deepEqual(one('ひらがな《かな》'), [t('ひらがな《かな》')])
// ｜《 は 《 そのもの
assert.deepEqual(one('題名は｜《夜》だ'), [t('題名は《夜》だ')])
// 閉じていない 《 はそのまま
assert.deepEqual(one('漢字《かんじ'), [t('漢字《かんじ')])

// 傍点
assert.deepEqual(one('それは《《絶対》》だめ'), [t('それは'), { type: 'emphasis', text: '絶対' }, t('だめ')])

// 段落と空行、BMP 外の字
assert.deepEqual(parseText('一\r\n\r\n𩸽《ほっけ》'), [[t('一')], [], [r('𩸽', 'ほっけ')]])

console.log('check:parse ok')
