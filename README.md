# Closet

今日どの服を着るかを、クローゼットの中から組み合わせて決めるための PWA です。

- 公開されるのはアプリだけです。服の台帳・写真・おすすめは非公開の Cmd に置き、ここには置きません
- Cmd は GitHub のトークン（Fine-grained personal access token、対象は Cmd だけ、Contents は Read-only）で読みます。トークンはその端末にだけ保存されます
- トークンがないときは見本データで動きます

## 読むもの（Cmd 側）

| もの | 場所 |
|---|---|
| 服の台帳 | `Notes/クローゼット.md`（`## アウター` などの見出しの下の表） |
| 写真 | `Data/closet/<id>.jpg`（台帳の「写真」の列にファイル名かパスを書く） |
| 今日のおすすめ | `Data/closet/today.json` |

`today.json` の形：

```json
{
  "date": "2026-11-17",
  "items": ["outer-001", "top-004", "bottom-001", "shoes-003"],
  "weather": "横浜 くもり 14℃",
  "reason": "選んだ理由"
}
```

## 画面

- 一覧：カテゴリ別のグリッドと、色の数
- 着せ替え：カテゴリごとに選ぶと縦に並べて表示（フラットレイ）
- 今日：today.json のおすすめと理由。👍／👎できる
- レビュー：自分で組んだコーデとおすすめの 👍／👎（いまは端末内に保存）

## 公開

GitHub Pages（Settings → Pages → Source を「GitHub Actions」）で公開します。`main` に入ると `.github/workflows/pages.yml` が動きます。
