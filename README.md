# Weight

無料・端末内処理の筋トレアプリ。V1 はカメラで腕立て伏せを自動カウントする Push-up Counter です。

## 機能

- MediaPipe Pose Landmarker で肩・肘・手首・腰・足首を推定
- 横からの全身姿勢を確認したうえで「上 → 下 → 上」を1回としてカウント
- 浅い腕の曲げ伸ばし・見失い・姿勢の崩れによる誤カウントを軽減
- カメラのリアルタイムプレビュー、骨格表示、肘角度、状態表示
- 音声カウント、一時停止／再開、カメラ切替、リセット
- KGS 11th（KGS01）の出席番号・4桁PINでログイン可能。ゲストでのカメラ利用も可能
- Weight独自のデータベース・有料APIなし

## ローカルで動かす

Node.js 22.12 以降を使用してください。

1. npm install
2. npm run dev
3. http://localhost:5173/ にアクセス

検証コマンド: npm run typecheck、npm test、npm run build。

カメラは HTTPS または localhost でのみ使用可能です。初回のAIモデルとWASMの取得にはインターネット接続が必要です。

## Vercel無料プレビュー

- GitHubでソース管理し、Vercel Hobby（非商用の個人利用）で公開する。VercelへのデプロイはGit連携を使用する。
- プロジェクトのフレームワークは Vite、ビルドコマンドは `npm run build`、出力は `dist`。
- 開発ブランチ `feature/v1-pushup-counter` のプレビューでiPhone Safari／Android Chromeから検証してからmainへマージする。
- GitHub Pagesは使用しない。Vercelの無料枠・利用規約を確認し、有料プラン・課金機能への移行は明示承認なしに行わない。
- プレビューURLにVercel Authentication等の保護が掛かる場合は、Vercelにログインするか、期限付きの共有リンクで開く。

## KGS 11th アカウント連携

- 既存のKGS出席番号と4桁PINを利用します。新しいKGSアカウントを作成したり、PINをWeightに保存したりしません。
- 入力したPINはWeightサーバーからKGSの専用サーバー間APIにのみ送ります。ブラウザへKGS統合秘密鍵・KGSトークンを返しません。
- Weight側には独立したホスト専用`Secure; HttpOnly; SameSite=Lax` Cookieを設定し、KGS側で失効を検証します。
- WeightはKGSのメンバーID・表示名だけ表示します。クラスの予定・投稿・写真・成績・ウォレットへのアクセスは実装しません。
- Vercel環境変数（サーバーのみ）`KGS_WEIGHT_API_ORIGIN`（KGS共有版の固定HTTPS origin）、`KGS_WEIGHT_INTEGRATION_SECRET`（KGS側と共有する**専用ランダム秘密**）を設定します。両方ともブラウザに公開しません。
- 連携環境変数未設定・KGS障害時はログインを拒否しますが、腕立てカメラをゲストで利用できます。
- 自動でトレーニング履歴をKGSへ同期しません。

## 撮影と判定

横向きのスマホを床の近くに置き、体の側面を明るい場所で撮影します。肩、肘、手首、腰、足首が画面に入るようにしてください。初期ルールは肘が約155°以上で準備、約105°以下で下降、155°以上に戻れば1回です。角度には平滑化・複数フレーム連続判定・クールダウンがあります。

**精度の制約:** 胸と床の実距離は直接測定できません。全身が見えない、真上や正面のアングル、逆光、素早い動き、服装や体型などで誤判定し得ます。これは運動回数の目安であり、医療・運動指導の代替ではありません。初期閾値は実機テストで調整します。

## データ・プライバシー・課金

映像の推論はブラウザ端末内で行い、Weight独自のサーバーにはカメラ映像を送信しません。WASMはjsDelivr、学習済みモデルはGoogle Storageから取得します。MediaPipeは性能や利用状況のメトリクスをGoogleに送る場合があります。詳細は MediaPipe のプライバシー通知（https://www.npmjs.com/package/@mediapipe/tasks-vision）を参照してください。

Vercel Hobby（利用条件内）、React、Vite、MediaPipeを利用し、有料API・有料サーバーを導入しません。将来の利用規約や無料枠の変更には留意します。明示承認なしに有料サービスを追加しません。

## リリース判定

CI／単体テストの成功と、実機の認識精度は別です。iPhone Safari／Android Chrome実機でカメラ許可・音声・発熱・10回の腕立ての認識精度を検証するまで V1 は実機確認待ちです。
