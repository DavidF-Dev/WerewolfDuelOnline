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

## Markers
marker-cross = Cross
marker-fang = Fang
marker-hourglass = Hourglass
marker-potion = Potion

## Why an attack was not made
forfeit-no-cross = there is no Cross to spend
forfeit-declined = the Cross was not spent
forfeit-cannot-pay-fangs = there are not enough Fangs for the extra targets
forfeit-no-targets = there are no character targets

## Why the game ended
win-reason-health = by reducing the opponent's health to zero
win-reason-fangs = by collecting enough Fangs
win-reason-crosses = by collecting enough Crosses
win-reason-resignation = because the opponent resigned

## Plans
plan-targeting = { $character } targeting { $targets }
plan-no-targets = { $character } with no targets

## Events
# Seat arguments are raw selector values: you, opponent, p0 or p1. The matching
# `...Name` argument holds the display name used for p0 and p1.
event-game-started = The game begins. Seed commitment: { $commitment }.
event-round-started = Round { $round } begins. { $actor ->
        [you] You hold
        [opponent] Your opponent holds
       *[other] { $actorName } holds
    } the Badge.
event-hand-dealt = { $actor ->
        [you] You are
        [opponent] Your opponent is
       *[other] { $actorName } is
    } dealt { $cards }.
event-plan-submitted = { $actor ->
        [you] You seal
        [opponent] Your opponent seals
       *[other] { $actorName } seals
    } a plan with { $count ->
        [one] 1 target card
       *[other] { $count } target cards
    }.
event-hourglasses-placed = { $actor ->
        [you] You place
        [opponent] Your opponent places
       *[other] { $actorName } places
    } { $n ->
        [one] 1 Hourglass
       *[other] { $n } Hourglasses
    }.
event-potion-target-chosen = { $actor ->
        [you] You aim
        [opponent] Your opponent aims
       *[other] { $actorName } aims
    } the Potion at the { $card }.
event-plans-revealed = Plans revealed. { $actor ->
        [you] You play
       *[other] { $actorName } plays
    } { $actorPlan } at initiative { $actorInitiative }. { $other ->
        [opponent] Your opponent plays
       *[other] { $otherName } plays
    } { $otherPlan } at initiative { $otherInitiative }. { $first ->
        [you] You resolve
        [opponent] Your opponent resolves
       *[other] { $firstName } resolves
    } first.
event-potion-resolved = { $result ->
        [hit] The Potion hits { $victim ->
            [you] your
            [opponent] your opponent's
           *[other] { $victimName }'s
        } { $card }! { $victim ->
            [you] You lose
            [opponent] Your opponent loses
           *[other] { $victimName } loses
        } { $health } health.
       *[miss] The Potion misses: { $victim ->
            [you] you
            [opponent] your opponent
           *[other] { $victimName }
        } did not play the { $card }.
    }
event-character-resolved = { $actor ->
        [you] Your
        [opponent] Your opponent's
       *[other] { $actorName }'s
    } { $character } resolves.
event-marker-gained = { $source ->
        [opponent] { $actor ->
            [you] You take
            [opponent] Your opponent takes
           *[other] { $actorName } takes
        } one { $marker } marker from { $other ->
            [you] you
            [opponent] your opponent
           *[other] { $otherName }
        }.
       *[supply] { $actor ->
            [you] You gain
            [opponent] Your opponent gains
           *[other] { $actorName } gains
        } one { $marker } marker.
    }
event-marker-spent = { $actor ->
        [you] You return
        [opponent] Your opponent returns
       *[other] { $actorName } returns
    } { $n } { $marker } { $n ->
        [one] marker
       *[other] markers
    } to the supply.
event-attack-hit = { $actor ->
        [you] Your
        [opponent] Your opponent's
       *[other] { $actorName }'s
    } { $character } hits { $targetSeat ->
        [you] you
        [opponent] your opponent
       *[other] { $targetSeatName }
    }! { $targetSeat ->
        [you] You lose
        [opponent] Your opponent loses
       *[other] { $targetSeatName } loses
    } { $health } health.
event-attack-missed = { $actor ->
        [you] Your
        [opponent] Your opponent's
       *[other] { $actorName }'s
    } attack misses.
event-attack-forfeited = { $actor ->
        [you] You make
        [opponent] Your opponent makes
       *[other] { $actorName } makes
    } no attack: { $reason }.
event-round-ended = Round { $round } ends. { $actor ->
        [you] You take
        [opponent] Your opponent takes
       *[other] { $actorName } takes
    } the Badge.
event-next-round-requested = { $actor ->
        [you] You are
        [opponent] Your opponent is
       *[other] { $actorName } is
    } ready for the next round.
event-resigned = { $actor ->
        [you] You resign.
        [opponent] Your opponent resigns.
       *[other] { $actorName } resigns.
    }
event-segment-started = The game resumes in round { $round }.
event-game-over = { $actor ->
        [you] You win
        [opponent] Your opponent wins
       *[other] { $actorName } wins
    } { $reason ->
        [health] by reducing { $other ->
            [you] your
            [opponent] your opponent's
           *[other] { $otherName }'s
        } health to zero.
        [fangs] by collecting enough Fangs.
        [resignation] because { $other ->
            [you] you
            [opponent] your opponent
           *[other] { $otherName }
        } resigned.
       *[crosses] by collecting enough Crosses.
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
error-edit-would-end-game = An edit cannot end the game: health must stay above 0, Crosses below 4 and Fangs below 3.

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
cli-opponent-markers = Opponent: health { $health }, Crosses { $cross }, Fangs { $fang }, Hourglasses { $hourglass }, placed { $placed }{ $potion ->
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
