# ymm-tools

## パス規約

動画名は CSV ファイル名から自動判定する: `{動画名}_画像管理シート.csv` or `.xlsx`

### ファイルの場所

- ymmp（元ファイル）: Windows VM 内 `C:\動画作成\YMM保存\{動画名}\{動画名}.ymmp`
- CSV/xlsx: Mac `~/Downloads/{動画名}_画像管理シート.csv` or `.xlsx`
- 実写/図解画像: Mac `~/Movies/{動画名}/` 配下
- AI生成画像: Mac `~/Movies/{動画名}/ai_images/` に自動生成

### 出力ファイル名

- template コマンド: `~/Movies/{動画名}/{動画名}-templete.ymmp`
- insert コマンド: `~/Movies/{動画名}/{動画名}-image.ymmp`

## コマンド

### find（ファイル検索）

```bash
bun run src/cli.ts find <動画名キーワード>
```

キーワードで Windows / Mac 両方のファイルを検索し、候補を一覧表示する。
prlctl 経由で Windows VM 内の `C:\動画作成\YMM保存\` を検索。

### template（テンプレート生成）

```bash
bun run src/cli.ts template --csv <path> --ymmp <path> --output <path> [--dry-run]
```

### insert（画像挿入）

```bash
bun run src/cli.ts insert --csv <path> --ymmp <path> --photos <dir> --output <path> [--dry-run] [--max-generate N] [--style <prefix>] [--negative <suffix>] [--regenerate 1,2,3] [-y]
```

## ワークフロー（Claudeへの指示）

ユーザーが「〇〇のテンプレート作って」「〇〇の画像挿入して」と言ったら：

1. `bun run src/cli.ts find <キーワード>` でファイルを検索
2. 検索結果からファイルパスを特定し、ユーザーに「これらのファイルで合ってますか？」と確認
3. ymmpがWindows側にしかない場合は `prlctl exec "Windows 11" powershell -Command "Copy-Item '<Windowsパス>' '\\Mac\Home\Downloads\' -Force"` でMacにコピー
4. 確認後、適切なコマンドを組み立てて実行

### template の流れ

1. find で検索
2. Windows から ymmp をコピー
3. `template --csv <CSV> --ymmp <コピーしたymmp> --output ~/Movies/{動画名}/{動画名}-templete.ymmp`
4. 「YMM4で確認・修正してください」と伝える

### insert の流れ

1. find で検索
2. template 出力の ymmp を入力として使用（`~/Movies/{動画名}/{動画名}-templete.ymmp`）
3. `insert --csv <CSV> --ymmp <テンプレートymmp> --photos ~/Movies/{動画名}/ --output ~/Movies/{動画名}/{動画名}-image.ymmp`
