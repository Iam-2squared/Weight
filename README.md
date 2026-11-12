# Weight

無料・端末内処理の筋トレアプリ。V1 はカメラで腕立て伏せを自動カウントする Push-up Counter です。

## 機能

- MediaPipe Pose Landmarker で肩・肘・手首・腰・足首を推定
- 横からの全身姿勢を確認したうえで「上 → 下 → 上」を1回としてカウント
- 浅い腕の曲げ伸ばし・見失い・姿勢の崩れによる誤カウントを軽減
- カメラのリアルタイムプレビュー、骨格表示、肘角度、状態表示
- 音声カウント、一時停止／再開、カメラ切替、リセット
- 認証、データベース、有料APIなし

## ローカルで動かす

Node.js 22.12 以降を使用してください。

1. npm install
2. npm run dev
3. http://localhost:5173/Weight/ にアクセス

検証コマンド: npm run typecheck、npm test、npm run build。

カメラは HTTPS または localhost でのみ使用可能です。初回のAIモデルとWASMの取得にはインターネット接続が必要です。

## 無料公開

GitHub Pages の公開リポジトリ向け無料枠を利用します。

1. Settings → Pages → Build and deployment → Source で GitHub Actions を選ぶ
2. V1のPRをレビューして main にマージする
3. mainへのpushで自動デプロイし、Actions の成功を確認する

公開先の想定: https://iam-2squared.github.io/Weight/ （実際に公開完了するまでは利用できません）

## 撮影と判定

横向きのスマホを床の近くに置き、体の側面を明るい場所で撮影します。肩、肘、手首、腰、足首が画面に入るようにしてください。初期ルールは肘が約155°以上で準備、約95°以下で下降、155°以上に戻れば1回です。角度には平滑化・複数フレーム連続判定・クールダウンがあります。

**精度の制約:** 胸と床の実距離は直接測定できません。全身が見えない、真上や正面のアングル、逆光、素早い動き、服装や体型などで誤判定し得ます。これは運動回数の目安であり、医療・運動指導の代替ではありません。初期閾値は実機テストで調整します。

## データ・プライバシー・課金

映像の推論はブラウザ端末内で行い、Weight独自のサーバーにはカメラ映像を送信しません。WASMはjsDelivr、学習済みモデルはGoogle Storageから取得します。MediaPipeは性能や利用状況のメトリクスをGoogleに送る場合があります。詳細は MediaPipe のプライバシー通知（https://www.npmjs.com/package/@mediapipe/tasks-vision）を参照してください。

GitHub Pages、React、Vite、MediaPipeは無料利用でき、有料API・有料サーバーを導入しません。将来の利用規約や無料枠の変更には留意します。明示承認なしに有料サービスを追加しません。

## リリース判定

CI／単体テストの成功と、実機の認識精度は別です。iPhone Safari／Android Chrome実機でカメラ許可・音声・発熱・10回の腕立ての認識精度を検証するまで V1 は実機確認待ちです。
