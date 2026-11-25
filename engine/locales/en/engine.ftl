# Werewolf: Duel! engine text (British English, sentence case).
# Character names may later become parameterised messages taking `$case`, for languages
# that inflect them.

## Seats
seat-p0 = Player 1
seat-p1 = Player 2

## Characters and factions
character-hunter = Hunter
character-wolf-king = Wolf King
character-knight = Knight
character-wolfen = Wolfen
character-seer = Seer
character-witch = Witch
character-wolf-beauty = Wolf Beauty
character-villager = Villager

faction-human = Human
faction-werewolf = Werewolf

target-fool = the Fool
target-character = the { $character }

## Markers
marker-cross = Cross
marker-fang = Fang
marker-hourglass = Hourglass
marker-potion = Potion
marker-health = Health
marker-badge = Badge
# A marker's name for an uncounted number of them.
marker-crosses = Crosses
marker-fangs = Fangs
# A marker's name after a count of them.
marker-cross-count = { $n ->
        [one] Cross
       *[other] Crosses
    }
marker-fang-count = { $n ->
        [one] Fang
       *[other] Fangs
    }
marker-hourglass-count = { $n ->
        [one] Hourglass
       *[other] Hourglasses
    }

## Why an attack was not made
# `cross` and `fangs` hold the marker names.
forfeit-no-cross = there is no { $cross } to spend
forfeit-declined = the { $cross } was not spent
forfeit-cannot-pay-fangs = there are not enough { $fangs } for the extra targets
forfeit-no-targets = there are no character targets

## Why the game ended
win-reason-health = by reducing the opponent's Health to zero
win-reason-fangs = by collecting enough Fangs
win-reason-crosses = by collecting enough Crosses
win-reason-resignation = because the opponent resigned

## Plans
plan-targeting = { $character } targeting { $targets }
plan-no-targets = { $character } with no targets

## Words for a player, seen from one seat
player-you-cap = You
player-you = you
player-your-cap = Your
player-your = your
player-opponent-cap = Your opponent
player-opponent = your opponent

## Events
# Seat arguments are raw selector values: you, opponent, p0 or p1. The matching
# `...Name` argument holds the display name used for p0 and p1. `badge`, `potion`,
# `health`, `hourglasses` and `marker` hold the name of a marker, counted where needed.
# `youCap`, `you`, `yourCap`, `your`, `opponentCap` and `opponent` hold the words that stand
# for a player in the you and opponent variants, so that they can be emphasised.
event-game-started = The game begins. Seed commitment: { $commitment }.
event-round-started = Round { $round } begins. { $actor ->
        [you] { $youCap } hold
        [opponent] { $opponentCap } holds
       *[other] { $actorName } holds
    } the { $badge }.
event-hand-dealt = { $actor ->
        [you] { $youCap } are
        [opponent] { $opponentCap } is
       *[other] { $actorName } is
    } dealt { $cards }.
event-plan-submitted = { $actor ->
        [you] { $youCap } seal
        [opponent] { $opponentCap } seals
       *[other] { $actorName } seals
    } a plan with { $count ->
        [one] 1 target card
       *[other] { $count } target cards
    }.
event-hourglasses-placed = { $actor ->
        [you] { $youCap } place
        [opponent] { $opponentCap } places
       *[other] { $actorName } places
    } { $n ->
        [0] no
       *[other] { $n }
    } { $hourglasses }.
event-potion-target-chosen = { $actor ->
        [you] { $youCap } aim
        [opponent] { $opponentCap } aims
       *[other] { $actorName } aims
    } the { $potion } at the { $card }.
event-plans-revealed = Plans revealed. { $actor ->
        [you] { $youCap } play
       *[other] { $actorName } plays
    } { $actorPlan } at initiative { $actorInitiative }. { $other ->
        [opponent] { $opponentCap } plays
       *[other] { $otherName } plays
    } { $otherPlan } at initiative { $otherInitiative }. { $first ->
        [you] { $youCap } resolve
        [opponent] { $opponentCap } resolves
       *[other] { $firstName } resolves
    } first.
event-potion-resolved = { $result ->
        [hit] The { $potion } hits { $victim ->
            [you] { $your }
            [opponent] { $opponent }'s
           *[other] { $victimName }'s
        } { $card }! { $victim ->
            [you] { $youCap } lose
            [opponent] { $opponentCap } loses
           *[other] { $victimName } loses
        } { $lost } { $health }.
       *[miss] The { $potion } misses: { $victim ->
            [you] { $you }
            [opponent] { $opponent }
           *[other] { $victimName }
        } did not play the { $card }.
    }
event-character-resolved = { $actor ->
        [you] { $yourCap }
        [opponent] { $opponentCap }'s
       *[other] { $actorName }'s
    } { $character } resolves.
event-marker-gained = { $source ->
        [opponent] { $actor ->
            [you] { $youCap } take
            [opponent] { $opponentCap } takes
           *[other] { $actorName } takes
        } 1 { $marker } from { $other ->
            [you] { $you }
            [opponent] { $opponent }
           *[other] { $otherName }
        }.
       *[supply] { $actor ->
            [you] { $youCap } gain
            [opponent] { $opponentCap } gains
           *[other] { $actorName } gains
        } { $markerId ->
            [potion] the { $marker }
           *[other] 1 { $marker }
        }.
    }
event-marker-spent = { $actor ->
        [you] { $youCap } spend
        [opponent] { $opponentCap } spends
       *[other] { $actorName } spends
    } { $n } { $marker }.
event-attack-hit = { $actor ->
        [you] { $yourCap }
        [opponent] { $opponentCap }'s
       *[other] { $actorName }'s
    } { $attacker } hits { $targetSeat ->
        [you] { $your }
        [opponent] { $opponent }'s
       *[other] { $targetSeatName }'s
    } { $character }! { $targetSeat ->
        [you] { $youCap } lose
        [opponent] { $opponentCap } loses
       *[other] { $targetSeatName } loses
    } { $lost } { $health }.
event-attack-missed = { $actor ->
        [you] { $yourCap }
        [opponent] { $opponentCap }'s
       *[other] { $actorName }'s
    } { $attacker } misses.
event-attack-forfeited = { $actor ->
        [you] { $youCap } make
        [opponent] { $opponentCap } makes
       *[other] { $actorName } makes
    } no attack: { $reason }.
event-round-ended = Round { $round } ends. { $actor ->
        [you] { $youCap } take
        [opponent] { $opponentCap } takes
       *[other] { $actorName } takes
    } the { $badge }.
event-discard-revealed = The card set aside in round { $round } was the { $character }.
event-next-round-requested = { $actor ->
        [you] { $youCap } are
        [opponent] { $opponentCap } is
       *[other] { $actorName } is
    } ready for the next round.
event-resigned = { $actor ->
        [you] { $youCap } resign.
        [opponent] { $opponentCap } resigns.
       *[other] { $actorName } resigns.
    }
event-segment-started = The game resumes in round { $round }.
event-game-over = { $actor ->
        [you] { $youCap } win
        [opponent] { $opponentCap } wins
       *[other] { $actorName } wins
    } { $reason ->
        [health] by reducing { $other ->
            [you] { $your }
            [opponent] { $opponent }'s
           *[other] { $otherName }'s
        } { $health } to zero.
        [fangs] by collecting enough { $fangs }.
        [resignation] because { $other ->
            [you] { $you }
            [opponent] { $opponent }
           *[other] { $otherName }
        } resigned.
       *[crosses] by collecting enough { $crosses }.
    }

## Commands, as offered to a player
command-submit-plan = Play { $plan }
command-place-hourglasses = Place { $n ->
        [one] 1 Hourglass
       *[other] { $n } Hourglasses
    }
command-choose-potion-target = Aim the Potion at { $card }
command-hunter-spend-cross-yes = Spend a Cross to attack
command-hunter-spend-cross-no = Keep the Cross
command-next-round = Next round

## Input errors
error-invalid-input = That input isn't valid.
error-engine-not-ready = The game engine hasn't finished loading.
error-game-disposed = This game has already been closed.

## Rule errors
error-game-over = The game is over.
error-not-your-turn = It is not your turn.
error-wrong-phase = That action is not allowed in this phase.
error-character-not-in-hand = That character is not in your hand.
error-target-not-allowed = That character can't target this card.
error-too-many-targets = That plan has too many targets.
error-too-few-targets = That plan needs more targets.
error-not-enough-hourglasses = You don't have that many Hourglasses.
error-invalid-potion-target = That card can't be the Potion target.

## Edit errors
error-edit-wrong-phase = Hands can only be edited before any plan is submitted.
error-edit-supply-exceeded = That would need more markers than exist.
error-edit-invalid-hands = Hands must use each character exactly once, with the right sizes.
error-edit-would-end-game = An edit cannot end the game: Health must stay above 0, Crosses below 4 and Fangs below 3.

## Replay errors
error-replay-format-version = Replay format version { $version } is not supported.
error-replay-engine-version = The replay was made with engine { $version }.
error-replay-no-segments = The replay has no segments.
error-replay-rule = Entry { $index } was rejected by the rules: { $detail }
error-replay-edit = Entry { $index } was rejected as an edit: { $detail }
error-replay-checkpoint-mismatch = The state hash differs from the checkpoint at entry { $index } of segment { $segment }.
error-replay-commitment-mismatch = The seed of segment { $segment } does not match its commitment.
error-replay-edits-unsupported = The replay contains edits, which this build cannot apply.
error-replay-invalid-boundary = A segment starts from an impossible round boundary.
error-replay-segment-discontinuity = Segment { $segment } does not continue from the previous one.
error-replay-taint-mismatch = The replay contains edits but is not marked as tainted.

## Command-line messages
error-unsafe-required = This command bypasses the rules. Pass --unsafe to confirm.
error-edit-expected-set = Expected 'set' but found '{ $detail }'.
error-edit-unknown-field = Unknown field '{ $detail }'.
error-edit-missing-value = Missing value for '{ $detail }'.
error-edit-bad-value = Invalid value '{ $detail }'.
error-edit-bad-hands = Invalid hands: { $detail }.
error-read-failed = Cannot read '{ $detail }'.
error-write-failed = Cannot write '{ $detail }'.
error-parse-failed = Cannot parse '{ $detail }'.
error-script-line = Script line { $line } is not valid: { $detail }.
error-fuzz-failed = Fuzzing found a problem: { $detail }.

cli-pass-to-player = Pass to Player { $n } — press Enter
cli-seed = Seed: { $seed }
cli-resign = Resign
cli-choose = Choose an action (number, or q to quit):
cli-choose-character = Choose a character (number, or q to quit):
cli-invalid-choice = That is not a valid choice.
cli-your-view = Round { $round }. Badge: { $badge }.
cli-your-hand = Your hand: { $cards }
cli-your-markers = Health { $health }, Crosses { $cross }, Fangs { $fang }, Hourglasses { $hourglass }, placed { $placed }{ $potion ->
        [yes] , holding the Potion
       *[no] { "" }
    }.
cli-opponent-markers = Opponent: Health { $health }, Crosses { $cross }, Fangs { $fang }, Hourglasses { $hourglass }, placed { $placed }{ $potion ->
        [yes] , holding the Potion
       *[no] { "" }
    }.
cli-game-over = Game over. { $winner } wins { $reason }.
cli-saved = Replay saved to { $path }.
cli-verify-ok = ok { $hash }
cli-verify-tainted = Notice: this replay is tainted. Its state was edited outside the rules, so it is not a fair game.
cli-step-header = Step { $step }: { $seat }
cli-step-command = Step { $step }: { $seat } — { $command }
cli-step-edit = Step { $step }: state edited
cli-step-start = Start of segment { $segment }
cli-step-continue = Press Enter for the next step
cli-edit-applied = Applied { $count ->
        [one] 1 edit
       *[other] { $count } edits
    }. The state is now tainted.
cli-state-written = State written to { $path }.
cli-fuzz-summary = Played { $games } games over { $rounds } rounds. Player 1 won { $wins0 }, Player 2 won { $wins1 }.
cli-fuzz-reason = Won { $reason }: { $games }
