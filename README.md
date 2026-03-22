# ymm-tools

YukkuriMovieMaker (YMM4) の動画制作を自動化するCLIツール。

CSV（画像管理シート）の情報をもとに、ymmpファイルへのテンプレート生成・画像挿入・表情設定を自動で行う。

## セットアップ

```bash
bun install
cp .env.example .env
# .env に GEMINI_API_KEY を設定（AI画像生成を使う場合）
```

## コマンド

### find — ファイル検索

動画名のキーワードで Windows VM / Mac 両方のファイルを検索する。

```bash
bun run src/cli.ts find <キーワード>
```

検索対象:
- Windows: `C:\動画作成\YMM保存\` 配下の ymmp ファイル（prlctl 経由）
- Mac: `~/Downloads/` の画像管理シート（CSV/xlsx）
- Mac: `~/Movies/` の実写/図解画像フォルダ

### template — テンプレート生成

音声のみのymmpから、セクション構造（タイトルカード・BGM・背景・立ち絵）を自動生成する。
CSVに「表情」列があれば、VoiceItemの表情パーツも自動設定する。

```bash
bun run src/cli.ts template --csv <CSV/xlsx> --ymmp <入力ymmp> --output <出力ymmp> [--dry-run]
```

生成されるアイテム:
- タイトルカード（背景 + 立ち絵 + テキスト + SE）
- コンテンツセクション（BGM + セリフ枠 + 背景 + 立ち絵 + セクションタイトル）
- VoiceItem のレイヤー移動・フレームシフト
- 表情の自動設定（CSVの「表情」列から）

### insert — 画像挿入

テンプレートymmpに実写/図解/AI画像を自動挿入する。

```bash
bun run src/cli.ts insert --csv <CSV/xlsx> --ymmp <テンプレートymmp> --photos <画像ディレクトリ> --output <出力ymmp> [options]
```

| オプション | 説明 |
|---|---|
| `--dry-run` | プレビューのみ（ymmpを変更しない） |
| `--max-generate N` | AI画像生成の最大枚数を制限 |
| `--style <prefix>` | AI画像のスタイルプロンプト |
| `--negative <suffix>` | AI画像のネガティブプロンプト |
| `--regenerate 1,2,3` | 指定IDのAI画像を再生成 |
| `-y` | 確認プロンプトをスキップ |

## 制作フロー

```
1. find でファイル検索・確認
2. template で元ymmp → テンプレートymmp を生成（表情含む）
3. YMM4でテンプレートを確認・微調整
4. insert でテンプレートymmp → 画像挿入済みymmp を生成
5. プレビューHTMLでAI画像を確認
6. 必要に応じて --regenerate で再生成
```

## CSV（画像管理シート）仕様

| 列名 | 必須 | 説明 |
|------|------|------|
| キャラ | ○ | キャラクター名（「ゆっくり霊夢」等） |
| セリフ | ○ | セリフテキスト |
| 表情 | | 表情名（空欄=通常） |
| 画像ID | | 画像グループの識別子 |
| 必要な画像 | | 画像の説明 |
| 画像種別 | | AI / 実写 / 図解 |
| 参考文献URL | | 参考文献のURL |
| AI用プロンプト | | AI画像生成用プロンプト |
| タイトルカード | | タイトルカードのテキスト |
| セクションタイトル | | セクションタイトルのテキスト |

### 対応する表情

| 表情名 | 説明 |
|--------|------|
| (空欄) | 通常 |
| 焦り | 焦った表情 |
| にやり | ニヤリとした表情 |
| 驚き | 驚いた表情 |
| 悲しみ | 悲しい表情 |
| 泣く | 泣いている表情 |
| 怒り | 怒った表情 |

## 環境変数

| 変数名 | 説明 |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API キー（AI画像生成に必要） |

## テスト

```bash
bun test
```
