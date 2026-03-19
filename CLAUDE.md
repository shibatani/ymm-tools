# ymm-tools

## パス規約

動画名は CSV ファイル名から自動判定する: `{動画名}_画像管理シート*.csv`

- CSV: `~/Downloads/{動画名}_画像管理シート*.csv`
- ymmp（元ファイル）: `~/Downloads/{動画名}.ymmp`
- 実写/図解画像: `~/Movies/{動画名}/` 配下のフォルダ
- AI生成画像: `~/Movies/{動画名}/ai_images/` に自動生成

### 出力ファイル名

- template コマンド: `~/Movies/{動画名}/{動画名}-templete.ymmp`
- insert コマンド: `~/Movies/{動画名}/{動画名}-image.ymmp`

### コマンドの流れ

1. template: 元ymmp → `{動画名}-templete.ymmp` を生成
2. insert: `{動画名}-templete.ymmp` を入力 → `{動画名}-image.ymmp` を出力
