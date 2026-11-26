# Werewolf: Duel! engine text (Japanese, plain polite form). The player is あなた; the opponent is 相手.

## Seats
seat-p0 = プレイヤー1
seat-p1 = プレイヤー2

## Characters and factions
# A message names a character with CHARACTER($id), or CHARACTER($id, case: "acc", article: "def"):
# the case (nom, acc, dat or gen) and the article (def, indef or none) are optional and default to
# nom and none. The name in a case is the character's attribute of that name, or its value.
# GENDER($id) gives the character's `.gender` attribute (masculine, feminine or neuter), or none
# when it has none, for a message to select on.
character-hunter = 狩人
character-wolf-king = 人狼王
character-knight = 騎士
character-wolfen = 若狼
character-seer = 占い師
character-witch = 魔女
character-wolf-beauty = 美狼
character-villager = 村人
# A character's name with its article: `name` is the name in `case`, and `gender` is the
# character's `.gender` attribute, or none. Japanese has no articles.
grammar-character-form = { $name }

faction-human = 人間
faction-werewolf = 人狼

# A plan's target. `character` is the name already in the form the plan's list gives; `case`
# and `article` give that form for the Fool.
target-fool = 愚者
target-character = { $character }

## Markers
marker-cross = 十字架
marker-fang = 牙
marker-hourglass = 砂時計
marker-potion = 薬
marker-health = 体力
marker-badge = バッジ
# A marker's name for an uncounted number of them.
marker-crosses = 十字架
marker-fangs = 牙
# A marker's name after a count of them; Japanese names do not change with the count.
marker-cross-count = { $n ->
       *[other] 十字架
    }
marker-fang-count = { $n ->
       *[other] 牙
    }
marker-hourglass-count = { $n ->
       *[other] 砂時計
    }

## Why an attack was not made
# `cross` and `fangs` hold the marker names. Each reason ends a clause followed by "ため".
forfeit-no-cross = 使える{ $cross }がない
forfeit-declined = { $cross }を使わなかった
forfeit-cannot-pay-fangs = 追加の対象に払う{ $fangs }が足りない
forfeit-no-targets = キャラクターを対象にしていない

## Why the game ended
win-reason-health = 相手の体力を0にしました
win-reason-fangs = 牙を十分に集めました
win-reason-crosses = 十字架を十分に集めました
win-reason-resignation = 相手が投了しました

## Plans
# A message that takes a list of characters may give the form of every item in it with
# `.list-case` and `.list-article`, as CHARACTER takes them.
plan-targeting = { CHARACTER($character) }（対象：{ $targets }）
plan-no-targets = { CHARACTER($character) }（対象なし）

## Words for a player, seen from one seat
# Japanese marks an owner with the particle の after these words, so "your" is the same word
# as "you".
player-you-cap = あなた
player-you = あなた
player-your-cap = あなた
player-your = あなた
player-opponent-cap = 相手
player-opponent = 相手
# Further words for languages whose words for a player change with their case, or with the
# gender of what they own; Japanese does not use them.
player-you-dat = あなた
player-your-acc-masculine = あなた
player-your-acc-feminine = あなた
player-opponent-dat = 相手
player-opponent-gen = 相手

## Events
# Character arguments are character ids, for CHARACTER; `cards` is a list of characters.
# Seat arguments are raw selector values: you, opponent, p0 or p1. The matching
# `...Name` argument holds the display name used for p0 and p1. `badge`, `potion`,
# `health`, `hourglasses` and `marker` hold the name of a marker, counted where needed.
# `youCap`, `you`, `yourCap`, `your`, `opponentCap` and `opponent` hold the words that stand
# for a player in the you and opponent variants, so that they can be emphasised; `youDat`,
# `yourAccMasculine`, `yourAccFeminine`, `opponentDat` and `opponentGen` hold the further words.
# An owner comes before what it owns, and the sentence names its subject first.
event-game-started = ゲーム開始。シードの確認値：{ $commitment }。
event-round-started = 第{ $round }ラウンド開始。{ $actor ->
        [you] { $youCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }が{ $badge }を持っています。
event-hand-dealt = { $actor ->
        [you] { $youCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }に{ $cards }が配られました。
event-plan-submitted = { $actor ->
        [you] { $youCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }がプランを確定しました（対象カード{ $count }枚）。
event-hourglasses-placed = { $actor ->
        [you] { $youCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }は{ $hourglasses }を{ $n ->
        [0] 置きませんでした
       *[other] { $n }個置きました
    }。
event-potion-target-chosen = { $actor ->
        [you] { $youCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }は{ $potion }の対象に{ CHARACTER($card) }を選びました。
event-plans-revealed = プランが公開されました。{ $actor ->
        [you] { $youCap }
       *[other] { $actorName }
    }：{ $actorPlan }、イニシアチブ{ $actorInitiative }。{ $other ->
        [opponent] { $opponentCap }
       *[other] { $otherName }
    }：{ $otherPlan }、イニシアチブ{ $otherInitiative }。{ $first ->
        [you] { $youCap }
        [opponent] { $opponentCap }
       *[other] { $firstName }
    }が先に行動します。
event-potion-resolved = { $result ->
        [hit] { $potion }が{ $victim ->
            [you] { $your }
            [opponent] { $opponent }
           *[other] { $victimName }
        }の{ CHARACTER($card) }に命中しました！{ $victim ->
            [you] { $yourCap }
            [opponent] { $opponentCap }
           *[other] { $victimName }
        }の{ $health }が{ $lost }減りました。
       *[miss] { $potion }は外れました。{ $victim ->
            [you] { $youCap }
            [opponent] { $opponentCap }
           *[other] { $victimName }
        }は{ CHARACTER($card) }を出していませんでした。
    }
event-character-resolved = { $actor ->
        [you] { $yourCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }の{ CHARACTER($character) }が行動します。
event-marker-gained = { $source ->
        [opponent] { $actor ->
            [you] { $youCap }
            [opponent] { $opponentCap }
           *[other] { $actorName }
        }は{ $other ->
            [you] { $you }
            [opponent] { $opponent }
           *[other] { $otherName }
        }から{ $marker }を1個奪いました。
       *[supply] { $actor ->
            [you] { $youCap }
            [opponent] { $opponentCap }
           *[other] { $actorName }
        }は{ $markerId ->
            [potion] { $marker }を
           *[other] { $marker }を1個
        }得ました。
    }
event-marker-spent = { $actor ->
        [you] { $youCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }は{ $marker }を{ $n }個使いました。
event-attack-hit = { $actor ->
        [you] { $yourCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }の{ CHARACTER($attacker) }の攻撃が{ $targetSeat ->
        [you] { $your }
        [opponent] { $opponent }
       *[other] { $targetSeatName }
    }の{ CHARACTER($character) }に命中しました！{ $targetSeat ->
        [you] { $yourCap }
        [opponent] { $opponentCap }
       *[other] { $targetSeatName }
    }の{ $health }が{ $lost }減りました。
event-attack-missed = { $actor ->
        [you] { $yourCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }の{ CHARACTER($attacker) }の攻撃は外れました。
event-attack-forfeited = { $actor ->
        [you] { $youCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }は{ $reason }ため、攻撃しませんでした。
event-round-ended = 第{ $round }ラウンド終了。{ $actor ->
        [you] { $youCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }が{ $badge }を受け取ります。
event-discard-revealed = 第{ $round }ラウンドで除外されたカードは{ CHARACTER($character) }でした。
event-next-round-requested = { $actor ->
        [you] { $youCap }
        [opponent] { $opponentCap }
       *[other] { $actorName }
    }は次のラウンドの準備ができました。
event-resigned = { $actor ->
        [you] { $youCap }は投了しました。
        [opponent] { $opponentCap }は投了しました。
       *[other] { $actorName }は投了しました。
    }
event-segment-started = 第{ $round }ラウンドからゲームを再開します。
event-game-over = { $reason ->
        [health] { $actor ->
            [you] { $yourCap }
            [opponent] { $opponentCap }
           *[other] { $actorName }
        }の勝ちです。{ $other ->
            [you] { $your }
            [opponent] { $opponent }
           *[other] { $otherName }
        }の{ $health }が0になりました。
        [fangs] { $actor ->
            [you] { $youCap }
            [opponent] { $opponentCap }
           *[other] { $actorName }
        }は{ $fangs }を十分に集めて勝ちました。
        [resignation] { $actor ->
            [you] { $yourCap }
            [opponent] { $opponentCap }
           *[other] { $actorName }
        }の勝ちです。{ $other ->
            [you] { $you }
            [opponent] { $opponent }
           *[other] { $otherName }
        }が投了しました。
       *[crosses] { $actor ->
            [you] { $youCap }
            [opponent] { $opponentCap }
           *[other] { $actorName }
        }は{ $crosses }を十分に集めて勝ちました。
    }

## Commands, as offered to a player
command-submit-plan = { $plan }を出す
command-place-hourglasses = { $n ->
        [0] 砂時計を置かない
       *[other] 砂時計を{ $n }個置く
    }
command-choose-potion-target = 薬の対象を{ CHARACTER($card) }にする
command-hunter-spend-cross-yes = 十字架を使って攻撃する
command-hunter-spend-cross-no = 十字架を使わない
command-next-round = 次のラウンドへ

## Input errors
error-invalid-input = その入力は無効です。
error-engine-not-ready = ゲームエンジンの読み込みがまだ終わっていません。
error-game-disposed = このゲームはすでに閉じられています。

## Rule errors
error-game-over = ゲームは終了しています。
error-not-your-turn = あなたの番ではありません。
error-wrong-phase = この操作は今のフェーズではできません。
error-character-not-in-hand = そのキャラクターは手札にありません。
error-target-not-allowed = そのキャラクターはこのカードを対象にできません。
error-too-many-targets = このプランは対象が多すぎます。
error-too-few-targets = このプランは対象が足りません。
error-not-enough-hourglasses = 砂時計が足りません。
error-invalid-potion-target = そのカードは薬の対象にできません。

## Edit errors
error-edit-wrong-phase = 手札を編集できるのは、どちらかがプランを確定する前だけです。
error-edit-supply-exceeded = マーカーが、ゲームにある数より多く必要になります。
error-edit-invalid-hands = 各キャラクターをちょうど1回ずつ、正しい枚数の手札に分けてください。
error-edit-would-end-game = 編集でゲームを終わらせることはできません。体力は0より多く、十字架は4未満、牙は3未満にしてください。

## Replay errors
error-replay-format-version = リプレイ形式のバージョン{ $version }には対応していません。
error-replay-engine-version = このリプレイはエンジン{ $version }で作られました。
error-replay-no-segments = リプレイに区間がありません。
error-replay-rule = 項目{ $index }はルールにより拒否されました：{ $detail }
error-replay-edit = 項目{ $index }は編集として拒否されました：{ $detail }
error-replay-checkpoint-mismatch = 区間{ $segment }の項目{ $index }で、状態のハッシュがチェックポイントと一致しません。
error-replay-commitment-mismatch = 区間{ $segment }のシードが確認値と一致しません。
error-replay-edits-unsupported = リプレイに編集が含まれていますが、このビルドでは適用できません。
error-replay-invalid-boundary = ありえないラウンドの区切りから始まる区間があります。
error-replay-segment-discontinuity = 区間{ $segment }が前の区間から続いていません。
error-replay-taint-mismatch = リプレイに編集が含まれていますが、改変済みとして記録されていません。

## Command-line messages
error-unsafe-required = このコマンドはルールを無視します。確認のため「--unsafe」を指定してください。
error-edit-expected-set = 「set」が必要ですが、「{ $detail }」がありました。
error-edit-unknown-field = 「{ $detail }」は不明な項目です。
error-edit-missing-value = 「{ $detail }」の値がありません。
error-edit-bad-value = 「{ $detail }」は無効な値です。
error-edit-bad-hands = 手札が無効です：{ $detail }。
error-read-failed = 「{ $detail }」を読み込めません。
error-write-failed = 「{ $detail }」に書き込めません。
error-parse-failed = 「{ $detail }」を解析できません。
error-script-line = スクリプトの{ $line }行目が無効です：{ $detail }。
error-fuzz-failed = ファジングで問題が見つかりました：{ $detail }。

cli-pass-to-player = プレイヤー{ $n }に交代して、Enterキーを押してください
cli-seed = シード：{ $seed }
cli-resign = 投了する
cli-choose = 行動を選んでください（番号を入力、qで終了）：
cli-choose-character = キャラクターを選んでください（番号を入力、qで終了）：
cli-invalid-choice = 有効な選択ではありません。
cli-your-view = 第{ $round }ラウンド。バッジ：{ $badge }。
cli-your-hand = あなたの手札：{ $cards }
# How the command-line tool joins a list. `cli-list-two` joins a list of two; a longer list is
# `cli-list-start` of its first item and the rest, each later item but the last two is
# `cli-list-middle` of that item and the rest, and the last two are joined by `cli-list-end`.
cli-list-two = { $first }、{ $second }
cli-list-start = { $first }、{ $second }
cli-list-middle = { $first }、{ $second }
cli-list-end = { $first }、{ $second }
cli-your-markers = 体力{ $health }、十字架{ $cross }、牙{ $fang }、砂時計{ $hourglass }、置いた砂時計{ $placed }{ $potion ->
        [yes] 、薬を所持
       *[no] { "" }
    }。
cli-opponent-markers = 相手：体力{ $health }、十字架{ $cross }、牙{ $fang }、砂時計{ $hourglass }、置いた砂時計{ $placed }{ $potion ->
        [yes] 、薬を所持
       *[no] { "" }
    }。
cli-game-over = ゲーム終了。{ $winner }の勝ちです。{ $reason }。
cli-saved = リプレイを「{ $path }」に保存しました。
cli-verify-ok = 検証に成功しました：{ $hash }
cli-verify-tainted = 注意：このリプレイは改変されています。ルールの外で状態が編集されたため、公正なゲームではありません。
cli-step-header = ステップ{ $step }：{ $seat }
cli-step-command = ステップ{ $step }：{ $seat }が「{ $command }」を選択
cli-step-edit = ステップ{ $step }：状態を編集
cli-step-start = 区間{ $segment }の開始
cli-step-continue = Enterキーで次のステップへ
cli-edit-applied = { $count }件の編集を適用しました。状態は改変済みになりました。
cli-state-written = 状態を「{ $path }」に書き出しました。
cli-fuzz-summary = { $games }ゲーム（計{ $rounds }ラウンド）をプレイしました。プレイヤー1が{ $wins0 }勝、プレイヤー2が{ $wins1 }勝です。
# `reason` is health, fangs, crosses or resignation.
cli-fuzz-reason = { $reason ->
        [health] 体力による勝利
        [fangs] 牙による勝利
        [crosses] 十字架による勝利
       *[resignation] 投了による勝利
    }：{ $games }
