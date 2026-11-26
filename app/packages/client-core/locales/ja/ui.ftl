# Werewolf: Duel! interface text (Japanese, plain polite form). The player is あなた; the opponent is 相手.
# A `character`, `card`, `firstCharacter` or `secondCharacter` argument is a character id, named
# with CHARACTER as the engine messages describe; a `cards` or `targets` list may declare
# `.list-case` and `.list-article` for its items.

## Connection status
status-connecting = 接続中
status-waiting = 相手を待っています
status-playing = プレイ中
status-game-over = ゲーム終了
status-disconnected = 切断されました
status-rejected = ルームに参加できませんでした

## Names
-game-name = Werewolf: Duel!
-author = David F Dev
-publisher = Whales Entertainment
app-title =
    { -game-name } Online

## Home
home-create-online = 新しいゲーム
home-join-online = ゲームに参加
footer-made-by = 制作：{ -author }
footer-unofficial = { -game-name }の非公式デジタル版です
footer-not-affiliated = { -publisher }とは関係ありません。
footer-get-game = カードゲームを買う ↗
footer-get-game-label = カードゲームを買う（新しいタブで開きます）
back = 戻る

## Home: continue and more
home-continue-heading = 続きから
home-status-line = { $status }・{ $when }
home-status-turn = 第{ $round }ラウンド・あなたの番・{ $when }
home-status-waiting = 第{ $round }ラウンド・相手の番・{ $when }
home-status-round = 第{ $round }ラウンド・{ $when }
home-status-paused-round = 中断中・第{ $round }ラウンド・{ $when }
home-resume = 再開
home-open = 開く
home-open-label = { $opponent }とのゲームを開く（ルーム{ $room }）
home-resume-label = { $opponent }とのゲームを再開（ルーム{ $room }）
home-opponent-unknown = 不明な相手
home-status-paused = 中断中
home-status-active = 進行中
home-status-finished = ゲーム終了・再戦できます
home-more-label = { $opponent }とのゲームのその他の操作
home-more-label-unknown = 不明な相手とのゲームのその他の操作
home-remove = この端末から削除
home-remove-title = このゲームを削除しますか？
home-remove-body = この端末からは再開できなくなります。ゲームが進行中の場合、あなたの席が時間切れになり、相手の勝ちになることがあります。あとで戻るには、参加コードとPINが必要です。
home-remove-body-finished = 履歴には残ります。
home-remove-confirm = 削除
home-remove-cancel = キャンセル
home-removed = ゲームを削除しました
home-remove-failed = ゲームを削除できませんでした。もう一度お試しください。
home-how-to-play = 遊び方
home-history = 履歴
home-settings = 設定

## Installing and updating
install-card-heading = アプリをインストール
install-card-text = インストールすると、ほかのアプリと同じように専用のウィンドウで開けます。
install-card-text-ios = ホーム画面に追加すると、ほかのアプリと同じように開けて、保存したゲームも消えにくくなります。
install-card-dismiss = 閉じる
install-button = インストール
install-ios-steps = 共有ボタンをタップし、「ホーム画面に追加」を選んでください。
update-region = アプリの更新
update-available = 新しいバージョンがあります
update-reload = 再読み込み

## Character reference
reference-heading = 遊び方
reference-characters-heading = キャラクター
reference-characters-intro = すべてのキャラクターと愚者、そしてそれぞれが行動したときの効果です。イニシアチブが低い方が先に行動します。
# Shown beside a character's name in languages other than English: its name as the English edition prints it.
reference-printed-name = 英語版：{ $name }

## Settings
settings-heading = 設定
settings-general = 一般
settings-install = アプリ
settings-installed = インストール済み
settings-language = 言語
settings-language-system = システム（{ $language }）
settings-theme = テーマ
settings-theme-system = システム
settings-theme-light = ライト
settings-theme-dark = ダーク
settings-display-name = 表示名
settings-display-name-hint = 相手に表示されます。空欄にすると、毎回たずねます。
settings-reading = 読みやすさとアクセシビリティ
settings-text-size = 文字の大きさ
settings-text-size-option = { $percent }%
settings-reading-font = 本文のフォント
settings-font-default = 標準
settings-extra-spacing = 文字と行の間隔を広げる
settings-card-text = カードの説明
settings-card-text-icons = アイコンと文字
settings-card-text-only = 文字のみ
settings-high-contrast = ハイコントラスト
settings-colour-blind-patterns = 色覚サポート用の模様
settings-reduced-motion = 動きを減らす
settings-motion-system = システム
settings-motion-on = オン
settings-motion-off = オフ
settings-showdown-speed = 対決の進み方
settings-speed-step = 1つずつ
settings-speed-auto = 自動
settings-speed-instant = すぐに表示
settings-haptics = 自分の番になったら振動する
settings-gameplay = ゲームプレイ
settings-confirm-plan = プランを確定する前に確認する
settings-rules-hints = ルールのヒント
settings-network = ネットワーク
settings-server = サーバー
settings-server-default = 標準
settings-server-custom = カスタム…
settings-server-address = サーバーのアドレス
settings-server-save = このサーバーを使う
settings-server-saved = サーバーを保存しました。
settings-server-invalid = https:// で始まり、ユーザー名やパスワードを含まないアドレスを入力してください（http:// はこのコンピューターの中でだけ使えます）。
settings-data = データ
settings-data-note = ゲーム、履歴、設定は、この端末にだけ保存されます。
settings-data-memory-only = このブラウザーはデータを保存していないため、タブを閉じると何も残りません。バックアップの書き出しはできます。
settings-data-backup = バックアップ
settings-data-export = 書き出す
settings-data-import = 読み込む
settings-data-history = 対戦履歴
settings-data-clear-history = 履歴を消去
settings-data-everything = この端末のすべて
settings-data-delete-all = すべてのデータを削除
backup-file-label = バックアップファイル
backup-seat-token-warning = バックアップには、この端末の席のトークンが含まれます。ファイルを持つ人なら誰でも、オンラインゲームのあなたの席を使えてしまいます。人に渡さず、大切に保管してください。
backup-export-title = バックアップを書き出しますか？
backup-export-confirm = 書き出す
backup-export-share = 共有
backup-export-cancel = キャンセル
backup-saved = バックアップを保存しました。
backup-save-failed = バックアップを保存できませんでした。
backup-error-corrupt = このファイルはバックアップとして読み込めません。壊れているか、編集された可能性があります。
backup-error-checksum = このバックアップはチェックサムと一致しません。書き出した後に変更されたか、壊れています。
backup-error-version = このバックアップは別のバージョンのアプリで作られたため、ここでは読み込めません。
backup-import-title = このバックアップを読み込みますか？
backup-import-confirm = 読み込む
backup-import-cancel = キャンセル
backup-preview-games = 終了したゲーム{ $count }件
backup-preview-sessions = 保存されたオンラインゲーム{ $count }件
backup-preview-skipped = ファイル内の保存されたオンラインゲームのうち{ $count }件は無効なため、読み込みません
backup-preview-settings-differ = このバックアップの設定は、今の設定と異なります。
backup-preview-settings-same = このバックアップの設定は、今の設定と同じです。
backup-preview-replace-settings = 今の設定をバックアップの設定に置き換える
backup-preview-merge-note = ゲームは同じものどうしで照合し、両方にある場合は新しい方を残します。この端末から削除されるものはありません。
backup-import-done = バックアップを読み込みました：追加{ $added }件、更新{ $updated }件。
backup-import-failed = バックアップを読み込めませんでした。何も変更されていません。
delete-history-title = 履歴を消去しますか？
delete-history-intro = この端末に保存された、終了したゲームの情報をすべて完全に削除します：
delete-history-keeps = 設定、表示名、保存されたオンラインゲームは残ります。
delete-history-confirm = 履歴を消去
delete-history-done = 履歴を消去しました。
delete-all-title = すべてのデータを削除しますか？
delete-all-intro = この端末に保存されたものをすべて完全に削除します：
delete-all-confirm = すべてのデータを削除
delete-item-settings = 設定と表示名
delete-item-history = 対戦履歴と戦績
delete-item-games = 中断中と進行中のゲーム（あとから再開できなくなります）
delete-device-only = 影響するのはこの端末だけです。相手の端末には相手の記録が残り、オンラインのルームは自然に期限切れになります。
delete-export-first = 先にバックアップを書き出す
delete-cancel = キャンセル
delete-failed = データを削除できませんでした。
settings-about = このアプリについて
settings-credits = クレジット
settings-licences = ライセンス
toggle-on = オン
toggle-off = オフ

## About
about-heading = このアプリについて
about-version = バージョン{ $version }
about-credits-heading = クレジット
about-credit-line = { $name }（{ $licence }）
# The credit for this game's own engine and app.
about-credit-engine = エンジンとアプリ
about-theme-credit = イラスト：{ $credit }
about-fonts-notice = フォントは{ $licence }のもとで使用しています。
about-licences-heading = ライセンス

## Host and join
host-heading = この端末でゲームをホスト
host-code-label = 参加コード
host-instructions = このブラウザーの別のタブでこのアプリを開き、「ゲームに参加」、「この端末」の順に選んで、このコードを入力してください。
host-starting = ゲームを始めています
host-failed = ゲームを始められませんでした。
join-heading = この端末のゲームに参加
join-code-label = 参加コード
join-code-hint = 6文字のコードです（例：{ $example }）。大文字と小文字は区別せず、スペースとドットは無視します。
join-code-invalid = ホストのタブに表示された6文字のコードを入力してください。
join-submit = 参加
join-connecting-hint = 何も起きない場合は、ホストのタブが開いたままか確認してください。

## Connection problems
status-disconnected-detail = ホストとの接続が切れました。ホストのタブが閉じられたか再読み込みされた場合、そのゲームは終了しています。
rejected-unknown-room = このブラウザーには、そのコードのゲームが開かれていません。
rejected-room-full = そのゲームにはすでに2人のプレイヤーがいます。
rejected-protocol-version = このページは古くなっています。再読み込みしてから、もう一度お試しください。
rejected-superseded = この席は別のタブで開かれました。
rejected-other = ホストが接続を拒否しました。
rejected-other-online = ゲームサーバーが接続を拒否しました。
rejected-wrong-pin = PINが違います。
rejected-pin-locked = その席で間違ったPINが何度も入力されました。15分後にもう一度試すか、相手に参加を許可してもらってください。

## Table
table-heading = テーブル
table-round = 第{ $round }ラウンド
table-round-showdown = 第{ $round }ラウンド・対決
table-status = 状態：{ $status }
opponent-heading = 相手：{ $name }
opponent-connected = 接続中
opponent-not-connected = 未接続
opponent-waiting-for-you = あなたを待っています
opponent-plan-sealed = 確定済み・対象{ $count }枚
my-area-heading = あなた：{ $name }
my-hand-heading = あなたの手札
my-hand-empty = 手札はありません。
actions-heading = 行動
log-heading = ゲームの記録
log-game-started = ゲームが始まりました。
game-over-heading = ゲーム終了
game-over-won = あなたの勝ちです！
game-over-lost = あなたの負けです。
# `result` is won or lost, for the player reading it; `winner` and `loser` are names or "You".
game-over-how = 第{ $round }ラウンドで{ $reason ->
        [health] { $loser }の{ $health }が0になりました。
        [fangs] { $winner }が{ $fangs }を十分に集めました。
        [crosses] { $winner }が{ $crosses }を十分に集めました。
       *[resignation] { $loser }が投了しました。
    }
game-over-markers = あなたのマーカー
game-over-view-replay = リプレイを見る
rematch = 再戦
rematch-waiting = 再戦を申し込みました。相手を待っています。
rematch-opponent-ready = 相手が再戦を希望しています。
rematch-started = 再戦が始まりました。このルームで{ $number }試合目です。
round-summary = 第{ $round }ラウンドのまとめ
round-summary-set-aside = 除外：{ CHARACTER($character) }
round-summary-badge = { $who ->
        [you] { $player }が第{ $next }ラウンドの{ $badge }を受け取ります。
       *[opponent] { $player }が第{ $next }ラウンドの{ $badge }を受け取ります。
    }

## Markers and cards
count-health = 体力：{ $n }
count-cross = 十字架：{ $n }
count-fang = 牙：{ $n }
count-hourglass = 砂時計：{ $n }
count-placed = 置いた砂時計：{ $n }
count-hand = 手札の枚数：{ $n }
holds-potion = 薬を持っています
holds-badge = バッジを持っています
plan-status-none = プラン：未確定
plan-status-hidden = プラン：確定済み、対象カード{ $count }枚
plan-status-revealed = プラン：{ $plan }
card-character =
    { CHARACTER($character) }、イニシアチブ{ $initiative }、{ $faction }
card-fool = 愚者
count-badge = バッジ：{ $n }
count-potion = 薬：{ $n }
# Starts with the card's visible text in the order it is drawn: the initiative, then the name.
card-name =
    { $initiative }、{ CHARACTER($character) }、{ $faction }。{ $ability }
card-fool-name = 愚者。{ $ability }
# A pill drawn on a target card, in place of its abilities, when the card is in the player's own hand.
card-in-hand = 手札

## Card abilities, in our own words; each marker named is an argument, so it can be drawn as a token
card-ability-hunter = { $cross }を使えば、人狼を2体まで攻撃できます。
card-ability-wolf-king = 人間を何体でも攻撃します。2体目からは1体ごとに{ $fang }が必要で、払えなければ攻撃しません。
card-ability-knight = { $hourglass }を得てから、人狼を攻撃します。
card-ability-wolfen = { $hourglass }を得てから、好きなキャラクターを攻撃します。
card-ability-seer = 人狼を攻撃します。命中すると相手の体力が2減ります。
card-ability-witch = { $potion }を得ます。対象にできるのは愚者だけです。
card-ability-wolf-beauty = { $fang }を得てから、好きなキャラクターを攻撃します。
card-ability-villager = { $cross }を得ます。対象にできるのは愚者だけです。
card-ability-fool = 効果はありません。ブラフとして、どのプランにも入れられます。

## Card text, drawn on large and medium cards; its words also appear in the matching card-ability message
card-text-hunter = { $cross }を使えば、人狼を2体まで攻撃できます。
card-text-wolf-king = 人間を攻撃します。2体目からは1体ごとに{ $fang }が必要です。
card-text-knight = { $hourglass }を得てから、人狼を攻撃します。
card-text-wolfen = { $hourglass }を得てから、好きなキャラクターを攻撃します。
card-text-seer = 人狼を攻撃します。命中すると体力が2減ります。
card-text-witch = { $potion }を得ます。対象にできるのは愚者だけです。
card-text-wolf-beauty = { $fang }を得てから、好きなキャラクターを攻撃します。
card-text-villager = { $cross }を得ます。対象にできるのは愚者だけです。
card-text-fool = 効果はありません。ブラフとして、どのプランにも入れられます。

## How to read abilities
legend-heading = 能力の読み方
legend-gain = 獲得
legend-gain-text = 描かれたマーカーを得ます。
legend-attack = 攻撃
legend-attack-text = 形1つにつき、キャラクターを1体攻撃します。
legend-shape-werewolf = 人狼
legend-shape-human = 人間
legend-shape-any = どのキャラクターでも
legend-damage = 追加ダメージ
legend-damage-text = 命中すると、体力が1ではなく2減ります。
legend-spend = 消費
legend-spend-text = この攻撃をするには、矢印の前のマーカーを使います。

## Phases
phase-plan = キャラクターと対象を選んで、プランを確定してください。
phase-reveal-hourglass = キャラクターに置く砂時計の数を選んでください。
phase-reveal-potion = 薬の対象にするカードを選んでください。
phase-hunter-choice = 狩人が行動します。十字架を使って攻撃するか選んでください。
phase-round-over = ラウンドが終わりました。
phase-final-showdown = 最後のラウンドの結果が出ました。
phase-waiting = 相手を待っています。
phase-none = 今はすることがありません。
phase-step-plan = プラン
phase-step-reveal = 公開
phase-step-potion = 薬
phase-step-showdown = 対決
phase-step-round-over = 終了

## Plan builder
plan-heading = あなたのプラン
plan-targets-heading = 対象
plan-summary = プラン：{ $plan }
plan-summary-empty = キャラクターを選んでください
plan-seal = プランを確定
plan-seal-incomplete = まだプランが完成していません。
plan-character-not-offered = このキャラクターはこのラウンドでは出せません。
target-not-allowed = 選んだキャラクターは、このカードを対象にできません。
target-limit = このプランにはこれ以上対象を加えられません。先に対象を1つ外してください。
target-choose-character-first = 先にキャラクターを選んでください。
plan-summary-short = { CHARACTER($character) } → { $targets }
plan-summary-short-none = { CHARACTER($character) } → 対象なし
plan-summary-fool = 愚者
plan-confirm-title = このプランで確定しますか？
plan-confirm-cancel = 選び直す

## Reveal
reveal-heading = 公開
reveal-hourglasses-heading = 砂時計を置く
reveal-stepper = 置く砂時計
reveal-hourglass-instruction = 砂時計をいくつ置きますか？
reveal-fewer = 砂時計を減らす
reveal-more = 砂時計を増やす
reveal-initiative = { CHARACTER($character) }：イニシアチブ{ $effective }（カードでは{ $printed }）
reveal-initiative-label = { CHARACTER($character) }のイニシアチブ
reveal-initiative-change = { $printed } → { $effective }
reveal-order-note = イニシアチブが低い方が先に行動します。
reveal-opponent-placed = { $n ->
        [0] 砂時計を置きませんでした
       *[other] 砂時計を{ $n }個置きました
    }
reveal-face-down = 相手のキャラクター（裏向き）
reveal-versus = 対
reveal-my-plan = あなたのプラン：{ $plan }
reveal-potion-heading = 薬の対象を選ぶ
reveal-potion-confirm = 先にカードを選んでください

## Showdown
showdown-heading = 対決
showdown-next = 次の結果
showdown-empty = 対決が進むと、ここに結果が表示されます。
showdown-hunter-heading = あなたの狩人
showdown-out-yours = { $owner }の{ CHARACTER($character) }は脱落したため、行動しません。
showdown-out-opponent = { $owner }の{ CHARACTER($character) }は脱落したため、行動しません。
plan-panels-heading = プラン
plan-panel-plan = { $name }：{ $plan }
plan-panel-position = { $position ->
        [1] 先攻
       *[other] 後攻
    }
plan-panel-initiative = イニシアチブ{ $initiative }
plan-panel-spoken = { $name }：{ $plan }。{ $position ->
        [1] 先に行動
       *[other] 後に行動
    }、イニシアチブ{ $effective }（カードでは{ $printed }）。
plan-panel-spoken-unknown = { $name }：{ $plan }。{ $position ->
        [1] 先に行動
       *[other] 後に行動
    }。

## Table layout
table-you = あなた
drawer-summary = ゲームの記録とルール
rules-heading = ルール
rules-order = イニシアチブが低い方が先に行動します。
rules-tiebreak-hourglasses-then-badge = 同じ値のときは、砂時計を多く置いたプレイヤーが先に、それも同じならバッジを持つプレイヤーが先に行動します。
rules-tiebreak-badge-only = 同じ値のときは、バッジを持つプレイヤーが先に行動します。
announcer-label = お知らせ
describe-button = テーブルの説明

## Rules hints
hint-plan = 相手には、選んだ対象カードの枚数だけが見え、どのカードかは見えません。
hint-place-hourglasses = 砂時計を1個置くごとに、キャラクターのイニシアチブが1下がります。
hint-choose-potion-target = 相手が出していれば、何よりも先に脱落します。
hint-hunter-choice = 十字架を使わなければ、狩人は攻撃しません。
hint-next-round = 次のラウンドでは、バッジがもう一方のプレイヤーに移ります。

## Table description
describe-round = 第{ $round }ラウンド。
describe-hand = あなたの手札：{ $cards }。
describe-hand-empty = 手札はありません。
describe-my-markers = あなたのマーカー：{ $markers }。
describe-opponent-markers = 相手のマーカー：{ $markers }。
describe-opponent-hand = 相手の手札は{ $n }枚です。
describe-my-plan = あなたのプラン：{ $plan }。
describe-my-plan-none = あなたはまだプランを確定していません。
describe-my-plan-hidden = あなたは対象カード{ $count }枚のプランを確定しました。
describe-opponent-plan = 相手のプラン：{ $plan }。
describe-opponent-plan-none = 相手はまだプランを確定していません。
describe-opponent-plan-hidden = 相手は対象カード{ $count }枚のプランを確定しました。
describe-potion-target = 薬の対象：{ CHARACTER($card) }。
describe-order = { $first ->
        [you] あなたの{ CHARACTER($firstCharacter) }が先に行動し、次に相手の{ CHARACTER($secondCharacter) }が行動します。
       *[opponent] 相手の{ CHARACTER($firstCharacter) }が先に行動し、次にあなたの{ CHARACTER($secondCharacter) }が行動します。
    }
describe-turn-you = あなたの番です。
describe-turn-opponent = 相手の番です。
describe-turn-both = 2人とも行動する必要があります。
describe-turn-none = 今は誰も行動する必要がありません。
app-load-failed = ゲームを読み込めませんでした。ページを再読み込みして、もう一度お試しください。

## Problems
problem-last = 直前の問題：{ $detail }
problem-rate-limited = 短い時間に操作が多すぎます。少し待ってから、もう一度お試しください。
problem-other = ホストが直前のメッセージを処理できませんでした。
problem-other-online = ゲームサーバーが直前のメッセージを処理できませんでした。
problem-not-connected = 今は接続されていません。接続が戻るのを待ってから、もう一度お試しください。
problem-command-not-sent = その操作はもうできません。

## Where to play
play-label = 遊ぶ場所
play-online = オンライン
play-device = この端末
play-create-hint-online = 参加コードで、どこにいる友だちとも遊べます。
play-create-hint-device = このブラウザーの2つのタブで、試しに遊べます。
play-join-hint-online = 友だちから届いたコードを入力します。
play-join-hint-device = 別のタブに表示されたコードを入力します。

## Online: creating a game
create-heading = 新しいゲーム
create-grace-legend = 再接続の猶予
create-grace-hint = 接続が切れたプレイヤーが戻るまでの時間です。過ぎると、相手が勝ちを宣言できます。
create-grace-option = { $minutes }分
create-badge-legend = バッジ（先手）
create-badge-random = ランダム
create-badge-me = 自分が先手
create-badge-opponent = 相手が先手
create-advanced = 詳細設定
create-tiebreak-legend = 同点のとき
create-tiebreak-hourglasses_then_badge = 砂時計、次にバッジ
create-tiebreak-badge_only = バッジのみ
create-min-targets-legend = 最少の対象数
create-min-targets-hint = プランで選ぶ対象カードの最少枚数です。
create-min-targets-option = { $count }
create-submit = ゲームを作成
create-creating = ゲームを作成しています
create-failed-rate-limited = このネットワークから最近作成されたゲームが多すぎます。しばらくしてから、もう一度お試しください。
create-failed-unavailable = ゲームサーバーが混み合っているか、使えません。少し待ってから、もう一度お試しください。
create-failed-server = ゲームサーバーが今は応答していません。しばらくしてから、もう一度お試しください。
create-failed-network = ゲームサーバーにつながりませんでした。接続を確認して、もう一度お試しください。
create-failed-other = ゲームを作成できませんでした。

## Online: display name
name-title = 相手にどう呼ばれたいですか？
name-label = あなたの名前
name-hint = 相手に表示されます。あとから設定で変えられます。
name-continue = 続ける
name-skip = スキップ

## Online: joining a game
online-join-heading = ゲームに参加
online-join-code-invalid = 相手から届いた6文字のコードを入力してください。
online-server-other = このゲームは別のサーバーを使っています：{ $host }
online-server-invalid = このリンクのサーバーのアドレスが無効なため、ゲームを開きませんでした。
online-join-new = 新しいプレイヤーとして参加
online-rejoin-pin = PINで戻る
online-room-full-rejoin = PINで戻る
online-join-other = 別のゲームに参加

## Online: inviting
invite-title = 友だちを招待
invite-heading = 相手を招待
invite-code-label = 参加コード
invite-instructions-resumed = コードかリンクを相手に送ってください。ゲームは中断中です。相手が参加し、2人とも「再開」を選ぶと続きから始まります。
invite-link = 招待リンク：{ $link }
invite-copy-code = コードをコピー
invite-share = リンクを共有
invite-waiting = 相手を待っています…
invite-joined = 相手が参加しました。ゲームを始めています…
invite-options = ゲームの設定
invite-option-badge-random = バッジ：ランダム
invite-option-badge-you = バッジ：あなたが先手
invite-option-badge-opponent = バッジ：相手が先手
invite-option-tiebreak = 同点のとき：{ $rule }
invite-option-min-targets = 最少の対象数：{ $count }
invite-share-text = { -game-name }で遊びましょう。コード{ $code }で参加してください。
copy-done = コピーしました
copy-failed = コピーできませんでした。文字を選択してコピーしてください。

## Online: connection
connection-heading = 接続
connection-online = 接続中
connection-connecting = 接続しています
connection-offline = 接続が切れました。再接続しています
connection-hidden = ページがバックグラウンドにある間は一時停止しています
connection-stopped = 未接続
connection-server-unavailable = ゲームサーバーが応答していません。ゲームはサーバーに保存されているので、あとでこのリンクがまた使えます。
opponent-reconnecting = 相手の再接続を待っています（{ $time }）
opponent-reconnect-over = 相手は時間内に再接続しませんでした。
opponent-still-waiting = 相手の再接続を待ち続けています。
claim-win = 勝ちを宣言
claim-keep-waiting = 待ち続ける
claim-confirm = 勝ちを宣言しますか？相手が投了したものとしてゲームが終わります。
stop-protocol-version = このページは古くなっています。再読み込みしてから、もう一度お試しください。
stop-room-full = そのゲームにはすでに2人のプレイヤーがいます。
stop-unknown-room = そのコードのゲームはありません。期限が切れたのかもしれません。コードを確認して、もう一度お試しください。
stop-unknown-seat = このゲームでのこの端末の席は、もう認識されていません。
stop-superseded = このゲームは別の端末で続いています。
stop-rejoin-declined = 相手がこの端末の参加を許可しませんでした。
stop-rejoin-unavailable = 今はこの方法でその席に戻れません。別の端末でまだ接続している場合は、PINを使ってください。

## Online: continuing on another device
continue-heading = 別の端末で続ける
continue-instructions = 別の端末で、復帰用リンクを開くか、「ゲームに参加」でコードを入力し、「PINで戻る」を選んでください。
continue-code = 参加コード：{ $code }
continue-seat = あなたの席：{ $seat }
continue-link = 復帰用リンク：{ $link }
continue-copy-link = 復帰用リンクをコピー
continue-show-pin = PINを表示
continue-hide-pin = PINを隠す
continue-pin = PIN：{ $pin }
continue-pin-hint = PINは人に教えないでください。知っている人なら誰でもあなたの席を使えます。
continue-qr-hint = 別の端末でこのコードを読み取っても開けます。中身は復帰用リンクで、PINは含まれません。

## Online: requests to take a seat
rejoin-request-title = 別の端末に相手の席を使わせますか？
rejoin-request-detail = PINを知らない誰かが、相手の席を使おうとしています。相手から頼まれた場合だけ許可してください。
rejoin-allow = 許可
rejoin-deny = 許可しない
pin-attempt-failed = 誰かが相手の席に間違ったPINを入力しました。

## Game menu
menu-summary = ゲームメニュー
sheet-close = 閉じる
menu-pause = このラウンドの後で中断

## Pausing
pause-heading = 中断
pause-requested-you = このラウンドの後で中断するよう申し込みました。相手の同意を待っています。
pause-requested-opponent = 相手がこのラウンドの後で中断したいと言っています。
pause-accept = 中断に同意
pause-decline = 続ける
pause-cancel = 中断を取り消す
pause-agreed = 中断に同意済み：ラウンドの終わりに中断します
paused-heading = ゲームは中断中です
paused-detail = ゲームはサーバーに保存され、この端末にも保存データがあります。再開する前に、下のラウンドとマーカーを確認してください。
resume = 再開
resume-waiting = 再開の準備ができました。相手を待っています。
resume-opponent-ready = 相手は再開の準備ができています。

## Saves
save-room-gone = このゲームのルームは閉じましたが、この端末に保存データが残っています。
save-resume = 保存データから再開
save-resuming = 保存データからルームを作っています
save-failed-invalid = ゲームサーバーが保存データを受け付けませんでした。

## Resigning
resign = 投了
resign-confirm = このゲームを投了しますか？相手の勝ちになります。
resign-cancel = 続ける

## Online: rejoining
rejoin-heading = ゲームに戻る
rejoin-seat-legend = どちらのプレイヤーでしたか？
rejoin-seat-missing = どちらのプレイヤーだったか選んでください。
rejoin-pin-label = PIN
rejoin-pin-hint = 4桁の数字です。遊んでいた端末の「別の端末で続ける」に表示されています。
rejoin-pin-invalid = 4桁のPINを入力するか、「PINがわからない」を選んでください。
rejoin-submit = 席に戻る
rejoin-ask = PINがわからない
rejoin-ask-hint = この端末の参加を許可するか、相手にたずねます。
rejoin-waiting-approval = 相手が参加を許可するのを待っています。
rejoin-joined = 戻りました。ゲームを開いています。

## Online: shared
countdown = { $minutes }:{ NUMBER($seconds, minimumIntegerDigits: 2) }
server-confirm = { $host }に接続しますか？信頼できる場合だけ続けてください。
server-continue = 続ける
server-cancel = キャンセル
opponent-disconnected = 相手の接続が切れました。
opponent-reconnected = 相手が再接続しました。
rejoin-request-expires = 残り{ $time }

## History
history-heading = 履歴
history-stats-link = 戦績
history-empty = 終了したゲームはまだありません。終えたオンラインゲームは、この端末にだけ記録されます。
history-won = 勝ち
history-lost = 負け
history-summary = { $opponent }に{ $result }
# A row of the history list: `result` (Won or Lost) is drawn in bold.
history-row-title = { $opponent }に{ $result }
history-meta = { $date }、{ $rounds }ラウンド、{ $reason }
history-row-meta = { $date }・{ $rounds }ラウンド・{ $reason }
history-played = 対戦数
history-won-by = 勝因：{ $reason }
history-replay = リプレイ
history-replay-label = リプレイ：{ $summary }、{ $meta }
reason-health = 体力
reason-fangs = 牙
reason-crosses = 十字架
reason-resignation = 投了

## Replay
replay-heading = リプレイ
replay-menu = リプレイメニュー
replay-missing = このゲームはこの端末にありません。
replay-position = { $step }/{ $total }・第{ $round }ラウンド
replay-controls = リプレイの操作
replay-previous-step = 前のステップ
replay-next-step = 次のステップ
replay-previous-round = 前のラウンド
replay-next-round = 次のラウンド
replay-keys-hint = 左右の矢印キーで前後に進めます。
replay-view-group = 視点
replay-view-mine = 自分の視点
replay-view-full = すべて
replay-command = { $who }の選択：{ $command }
replay-hands-heading = 手札
replay-hand-of = { $name }の手札
replay-hand-hidden = { $n }枚（非公開）
replay-hand-empty = カードなし
replay-log-heading = このステップの出来事
replay-log-empty = このステップでは何も起きませんでした。
replay-log-above = 起きたことは上に表示されています。

## Stats
stats-heading = 戦績
stats-overall-caption = 全体
stats-empty = 終了したゲームがまだないため、戦績はありません。
stats-games = 対戦数：{ $n }
stats-record = { $won }勝{ $lost }敗
stats-average-rounds = 1ゲームの平均ラウンド数：{ $n }
stats-conditions-caption = 勝利条件ごとの結果
stats-picks-caption = 選んだキャラクター
stats-picks-note = あなたが選んだものだけです。選んだキャラクターがマーカーを得るか、攻撃を命中させると成功です。
stats-opponents-caption = 相手ごとの結果
stats-col-condition = 勝利条件
stats-col-character = キャラクター
stats-col-opponent = 相手
stats-col-won = 勝ち
stats-col-lost = 負け
stats-col-picked = 選択
stats-col-succeeded = 成功
stats-col-rate = 成功率
stats-rate = { $percent }%
stats-rate-none = 未選択
