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

### コマンドの流れ

1. `find` でファイルを検索・確認
2. `template`: 元ymmp → `{動画名}-templete.ymmp` を生成
3. `insert`: `{動画名}-templete.ymmp` を入力 → `{動画名}-image.ymmp` を出力
