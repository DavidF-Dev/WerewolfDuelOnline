# Werewolf: Duel! interface text (British English, sentence case).
# A `character`, `card`, `firstCharacter` or `secondCharacter` argument is a character id, named
# with CHARACTER as the engine messages describe; a `cards` or `targets` list may declare
# `.list-case` and `.list-article` for its items.

## Connection status
status-connecting = Connecting
status-waiting = Waiting for an opponent
status-playing = Playing
status-game-over = Game over
status-disconnected = Disconnected
status-rejected = Could not join the room

## Names
-game-name = Werewolf: Duel!
-author = David F Dev
-publisher = Whales Entertainment
app-title =
    { -game-name } Online

## Home
home-create-online = New game
home-join-online = Join game
footer-made-by = Made by { -author }
footer-unofficial = An unofficial digital version of { -game-name }
footer-not-affiliated = Not affiliated with { -publisher }.
footer-get-game = Get the physical game ↗
footer-get-game-label = Get the physical game (opens in a new tab)
back = Back

## Home: continue and more
home-continue-heading = Continue
home-status-line = { $status } · { $when }
home-status-turn = Round { $round } · your turn · { $when }
home-status-waiting = Round { $round } · waiting for the opponent · { $when }
home-status-round = Round { $round } · { $when }
home-status-paused-round = Paused · Round { $round } · { $when }
home-resume = Resume
home-open = Open
home-open-label = Open game with { $opponent }, room { $room }
home-resume-label = Resume game with { $opponent }, room { $room }
home-opponent-unknown = Unknown opponent
home-status-paused = Paused
home-status-active = In progress
home-status-finished = Game over · rematch possible
home-more-label = More for the game with { $opponent }
home-more-label-unknown = More for the game with an unknown opponent
home-remove = Remove from this device
home-remove-title = Remove this game?
home-remove-body = You won't be able to resume it from this device. If the game is still in progress, your seat may time out and your opponent may win. To rejoin later you'd need the join code and your PIN.
home-remove-body-finished = It stays in your history.
home-remove-confirm = Remove
home-remove-cancel = Cancel
home-removed = Game removed
home-remove-failed = The game couldn't be removed. Try again.
home-how-to-play = How to play
home-history = History
home-settings = Settings

## Installing and updating
install-card-heading = Install the app
install-card-text = Install it to open it like any other app, in its own window.
install-card-text-ios = Add it to your home screen to open it like any other app, and keep your saved games safe.
install-card-dismiss = Dismiss
install-button = Install
install-ios-steps = Tap the share button, then “Add to Home Screen”.
update-region = App updates
update-available = A new version is available
update-reload = Reload

## How to play
how-to-play-heading = How to play
how-to-play-tutorial-heading = New to the game?
how-to-play-tutorial-text = Play one guided round against { -tutorial-opponent }. It takes about five minutes, and you can leave at any time.
how-to-play-tutorial-done-heading = Tutorial finished
how-to-play-tutorial-again = Play it again
how-to-play-start-tutorial = Start the tutorial
how-to-play-rules-heading = Rules

## Rules pages, in our own words: one message per paragraph
# Marker words are arguments, so that their tokens are drawn: `cross`, `crosses`, `fang`, `fangs`,
# `hourglass`, `hourglasses`, `potion`, `health` and `badge`. A character is named with CHARACTER
# and an argument named after it: `hunter`, `wolfKing`, `knight`, `wolfen`, `seer`, `witch`,
# `wolfBeauty` or `villager`.
rules-progress = Rules · { $index } of { $total }
rules-pages = Rules pages
rules-previous = Previous
rules-next = Next
rules-sheet-title = Rules

rules-goal-title = The goal
rules-goal-summary = Three ways to win.
rules-goal-intro = Every round, you and your opponent each secretly choose a character to play, and then the two characters act one after the other. You win as soon as one of these is true:
rules-goal-crosses = You hold 4 { $crosses }.
rules-goal-fangs = You hold 3 { $fangs }.
rules-goal-health = Your opponent has no { $health } left.
rules-goal-instant = The game stops the moment one of these happens, even halfway through a round, so the order in which the characters act matters. If you run out of { $health } yourself, you lose.
rules-goal-bluff = You never see your opponent's hand. Each round is a guess at the character your opponent has chosen, and a chance to make your own choice hard to read.

rules-setup-title = Setting up
rules-setup-summary = { $health }, { $crosses }, the { $badge } and the first { $hourglass }.
rules-setup-cards = There are 8 characters. The number on each one is its initiative: the lower it is, the sooner the character acts. Each character is a Human or a Werewolf, which decides which characters can target it. You and your opponent also each have a set of 9 target cards: one for each character, and the Fool.
rules-setup-markers = You and your opponent each start with 2 { $health } and 1 { $cross }.
rules-setup-badge = One of you starts with the { $badge }: the host chooses who, or leaves it to chance. The { $badge } holder is dealt an extra card and decides first, and the { $badge } changes hands after every round.
rules-setup-hourglass = The player who starts without the { $badge } takes 1 { $hourglass }.
rules-setup-supply = The rest of the markers make up the supply. A marker you gain comes from the supply, and a marker you spend goes back to it.

rules-round-title = A round
rules-round-summary = Deal, plan, reveal, showdown, round end.
rules-round-intro = Every round has the same five steps.
rules-round-deal-title = Deal
rules-round-deal = The 8 characters are shuffled, and one is set aside face down, unseen by either of you. The { $badge } holder is dealt 4 of the others and the other player 3. Only you can see your hand.
rules-round-plan-title = Plan
rules-round-plan = At the same time, you and your opponent each make a plan: one character from your hand, and at least one target card naming the character you think your opponent chose. Each character's card says what it may target, and the Fool can be added to any plan.
rules-round-plan-2 = When your plan is ready, you seal it. Your opponent learns how many target cards you chose, but not which ones. The rest of your hand is discarded unseen.
rules-round-reveal-title = Reveal
rules-round-reveal = If you hold { $hourglasses }, you may place some or all of them on the character you chose. The { $badge } holder chooses first, then the other player, knowing that number. Each { $hourglass } placed lowers the character's initiative by 1, but never below 0.
rules-round-reveal-2 = If you hold the { $potion }, you must use it now: name one character that wasn't dealt to you this round.
rules-round-reveal-3 = Then both plans are turned face up.
rules-round-showdown-title = Showdown
rules-round-showdown = The { $potion } comes first. If it names the other player's character, that character is eliminated before anything acts, and its owner loses 1 { $health }.
rules-round-showdown-2 = Then the characters act, lowest initiative first. On a tie, the character with more { $hourglasses } placed on it goes first, then the { $badge } holder's. A character gains or spends its markers first, and then attacks its targets.
rules-round-showdown-3 = An attack hits if one of its targets names the other player's character and that character hasn't acted yet. The character hit is eliminated without acting, and its owner loses 1 { $health }, or 2 when the { CHARACTER($seer) } hits.
rules-round-end-title = Round end
rules-round-end = The placed { $hourglasses } go back to the supply, the { $badge } passes to the other player, and the card set aside is shown to you both. Once you are both ready, the next round is dealt.

rules-markers-title = Markers
rules-markers-summary = What each marker does and where it comes from.
rules-markers-intro = Every marker you and your opponent hold is on show to you both.
rules-markers-cross = Hold 4 to win. You each start with 1, the { CHARACTER($villager) } gains 1, and the { CHARACTER($hunter) } spends 1 to attack.
rules-markers-fang = Hold 3 to win. The { CHARACTER($wolfBeauty) } gains 1, and the { CHARACTER($wolfKing) } spends them to attack more than one Human.
rules-markers-hourglass = Placed on your character in the reveal, each one lowers its initiative by 1. The player without the { $badge } starts with 1, and the { CHARACTER($knight) } and the { CHARACTER($wolfen) } each gain 1.
rules-markers-potion = The { CHARACTER($witch) } gains it. In the next reveal, its holder must name a character, and if the other player played that character, it is eliminated before anything acts. Then the { $potion } goes back to the supply.
rules-markers-health = You start with 2 and never get any back. If you have none left, you lose.
rules-markers-badge = Its holder is dealt 4 cards instead of 3, chooses { $hourglasses } first, and acts first in a tie that the { $hourglasses } placed don't settle. It passes to the other player after every round.

rules-characters-title = Characters
rules-characters-summary = Every character, and how to read abilities.

rules-fine-points-title = Fine points
rules-fine-points-summary = Ties, the { $potion }, the Fool and other details.
rules-fine-points-ties-title = Ties
rules-fine-points-ties = When both characters end up with the same initiative, the one with more { $hourglasses } placed on it acts first. If that is equal too, the { $badge } holder's character acts first.
rules-fine-points-empty-supply-title = No { $hourglasses } left
rules-fine-points-empty-supply = Placed { $hourglasses } stay on the characters until the round ends, so the supply can run out. If the { CHARACTER($knight) } or the { CHARACTER($wolfen) } gains an { $hourglass } then, it is taken from the other player instead. If the other player has none either, nothing is gained.
rules-fine-points-immune-title = Too late to hit
rules-fine-points-immune = An attack only hits a character that hasn't acted yet, so once a character has acted, it is safe for the rest of the round. A character is eliminated only once: another hit on it, even after the { $potion }, does nothing more.
rules-fine-points-potion-title = The { $potion }
rules-fine-points-potion = The { $potion } can name any character that wasn't dealt to you this round, played or not, including one your own plan targets. It works on every character, the { CHARACTER($witch) } included. The Fool isn't a character, so it can't be named.
rules-fine-points-wolf-king-title = The { CHARACTER($wolfKing) } and { $fangs }
rules-fine-points-wolf-king = The { CHARACTER($wolfKing) } can target any number of Humans. Every Human after the first costs 1 { $fang }, paid when it acts. If you can't pay for them all, you pay nothing and it doesn't attack. The Fool costs nothing.
rules-fine-points-hunter-title = The { CHARACTER($hunter) } and its { $cross }
rules-fine-points-hunter = When the { CHARACTER($hunter) } acts, you choose whether to spend 1 { $cross }. Only if you do does it attack, at up to 2 Werewolves; with no { $cross }, it can't attack. Keeping the { $cross } brings you closer to holding 4.
rules-fine-points-hand-title = Cards in your hand
rules-fine-points-hand = A card dealt to you can't be the character your opponent plays, so your plan can't target it, and the game doesn't offer it. The targets you are offered are the characters you weren't dealt, and the Fool. Your opponent's cards are among them, but so is the card set aside, so every target is a guess.
rules-fine-points-fool-title = The Fool
rules-fine-points-fool = The Fool does nothing. Add it to any plan to change how many target cards your opponent sees, or make it your only target to play a character without attacking. The { CHARACTER($witch) } and the { CHARACTER($villager) } can only target the Fool.
rules-fine-points-options-title = Rules a host can change
rules-fine-points-options = Older printings of the game settle every tie by the { $badge } alone. A host can choose that rule when creating a game: a tie then always goes to the { $badge } holder.
rules-fine-points-options-2 = A host can also allow plans with no targets. A character played without targets still gains its markers, but doesn't attack.

## Character reference
reference-characters-intro = Every character and the Fool, with what each does when it resolves. Lower initiative resolves first.
# Shown beside a character's name in languages other than English: its name as the English edition prints it.
reference-printed-name = Printed name: { $name }

## Tutorial
# The scripted opponent's name, defined once; every tutorial message names the opponent through this term.
-tutorial-opponent = Alicia
tutorial-opponent-name = { -tutorial-opponent }
tutorial-heading = Tutorial
# Above the coach's text in the phase bar, as in "Tutorial · 2 of 5 · Make a plan".
tutorial-progress = Tutorial · { $step } of { $count } · { $title }
tutorial-next = Next
tutorial-finish = Finish
tutorial-leave = Leave tutorial
tutorial-starting = Setting up the tutorial…
tutorial-failed = The tutorial couldn't start. Go back and try again.
# The coach's text for each step: at most three lines at 360 px and 100 % text. Marker words and
# characters are arguments, as in the rules pages.
tutorial-goal-title = Your goal
tutorial-goal-text = You win with 4 { $crosses } or 3 { $fangs }, or once { -tutorial-opponent } has no { $health } left. These rows of markers keep count.
tutorial-plan-title = Make a plan
tutorial-plan-text = You can't see the cards { -tutorial-opponent } holds, so every target is a guess. Most are Werewolves: try the { CHARACTER($knight) } on the { CHARACTER($wolfen) }.
tutorial-reveal-title = Reveal
tutorial-reveal-text = Lower initiative acts first: your { CHARACTER($knight) } is 3. If { -tutorial-opponent } is playing the { CHARACTER($wolfen) } you targeted, that is 4. Each { $hourglass } placed lowers initiative by 1. Place 0.
tutorial-showdown-title = Showdown
tutorial-showdown-text = The { CHARACTER($knight) } acts first: it gains an { $hourglass } and hits the { CHARACTER($wolfen) }, which is out before it acts. { -tutorial-opponent } loses 1 { $health }.
tutorial-round-end-title = Round end
tutorial-round-end-text = The { $badge } changes hands, and the card set aside is shown. A real game goes on like this, round after round, until someone wins.
tutorial-done-heading = You've played a whole round
tutorial-done-learned = You've learned
tutorial-done-goal = The three ways to win
tutorial-done-plan = Planning one character and its targets
tutorial-done-reveal = { $hourglasses } and the { $badge }
tutorial-done-showdown = Who acts first, and what a hit does
tutorial-done-more = A real game goes on, round after round, until someone wins. Every rule is in the rules pages.
tutorial-done-play = Play with a friend
tutorial-done-rules = Read the rules
tutorial-done-again = Play the tutorial again

## Home: the newcomer panel
home-newcomer-heading = New to { -game-name }?
home-newcomer-text = Learn by playing one guided round.
home-newcomer-learn = Learn to play
home-newcomer-dismiss = Dismiss

## Settings
settings-heading = Settings
settings-general = General
settings-install = Install app
settings-installed = Installed
settings-language = Language
settings-language-system = System ({ $language })
settings-theme = Theme
settings-theme-system = System
settings-theme-light = Light
settings-theme-dark = Dark
settings-display-name = Display name
settings-display-name-hint = Shown to your opponent. Leave it empty to be asked each time.
settings-reading = Reading & accessibility
settings-text-size = Text size
settings-text-size-option = { $percent }%
settings-reading-font = Reading font
settings-font-default = Default
settings-extra-spacing = Extra letter and line spacing
settings-card-text = Card text
settings-card-text-icons = Icons and text
settings-card-text-only = Text only
settings-high-contrast = High contrast
settings-colour-blind-patterns = Colour-blind patterns
settings-reduced-motion = Reduced motion
settings-motion-system = System
settings-motion-on = On
settings-motion-off = Off
settings-showdown-speed = Showdown speed
settings-speed-step = Step by step
settings-speed-auto = Auto
settings-speed-instant = Instant
settings-haptics = Vibrate on my turn
settings-gameplay = Gameplay
settings-confirm-plan = Confirm before sealing a plan
settings-rules-hints = Rules hints
settings-network = Network
settings-server = Server
settings-server-default = Default
settings-server-custom = Custom…
settings-server-address = Server address
settings-server-save = Use this server
settings-server-saved = Server saved.
settings-server-invalid = Enter a web address that starts with https:// (plain http:// works only for this computer) and has no user name or password.
settings-data = Data
settings-data-note = Your games, history and settings are stored only on this device.
settings-data-memory-only = This browser is not keeping your data, so nothing is kept after the tab closes. You can still export a backup.
settings-data-backup = Backup
settings-data-export = Export
settings-data-import = Import
settings-data-history = Match history
settings-data-clear-history = Clear history
settings-data-everything = Everything on this device
settings-data-delete-all = Delete all data
backup-file-label = Backup file
backup-seat-token-warning = A backup holds this device's seat tokens, which let anyone with the file take your seats in online games. Keep it private and don't share it.
backup-export-title = Export a backup?
backup-export-confirm = Export
backup-export-share = Share
backup-export-cancel = Cancel
backup-saved = Backup saved.
backup-save-failed = The backup could not be saved.
backup-error-corrupt = This file is not a readable backup. It may be damaged or edited.
backup-error-checksum = This backup does not match its checksum, so it has been changed or damaged since it was exported.
backup-error-version = This backup was made by a different version of the app, so it cannot be imported here.
backup-import-title = Import this backup?
backup-import-confirm = Import
backup-import-cancel = Cancel
backup-preview-games = { $count ->
        [one] 1 finished game
       *[other] { $count } finished games
    }
backup-preview-sessions = { $count ->
        [one] 1 saved online game
       *[other] { $count } saved online games
    }
backup-preview-skipped = { $count ->
        [one] 1 saved online game in the file is invalid and will be skipped
       *[other] { $count } saved online games in the file are invalid and will be skipped
    }
backup-preview-settings-differ = The settings in this backup differ from yours.
backup-preview-settings-same = The settings in this backup match yours.
backup-preview-replace-settings = Replace my settings with the backup's
backup-preview-merge-note = Games are matched by identity, and where both copies exist the newer one is kept. Nothing on this device is removed.
backup-import-done = Backup imported: { $added } added, { $updated } updated.
backup-import-failed = The backup could not be imported, and nothing was changed.
delete-history-title = Clear history?
delete-history-intro = This permanently deletes everything stored on this device about your finished games:
delete-history-keeps = Your settings, display name and saved online games are kept.
delete-history-confirm = Clear history
delete-history-done = History cleared.
delete-all-title = Delete all data?
delete-all-intro = This permanently deletes everything stored on this device:
delete-all-confirm = Delete all data
delete-item-settings = Settings and your display name
delete-item-history = Match history and stats
delete-item-games = Paused and active games, which can't be resumed afterwards
delete-device-only = This affects this device only. Your opponents keep their own copies, and online rooms expire on their own.
delete-export-first = Export backup first
delete-cancel = Cancel
delete-failed = The data could not be deleted.
settings-about = About
settings-credits = Credits
settings-licences = Licences
toggle-on = ON
toggle-off = OFF

## About
about-heading = About
about-version = Version { $version }
about-credits-heading = Credits
about-credit-line = { $name }, { $licence }
# The credit for this game's own engine and app.
about-credit-engine = Engine and app
about-theme-credit = Artwork: { $credit }
about-fonts-notice = The fonts are used under the { $licence }.
about-licences-heading = Licences

## Host and join
host-heading = Host a local game
host-code-label = Join code
host-instructions = Open this app in another tab of this browser, choose "Join game", then "On this device", and enter this code.
host-starting = Starting the game
host-failed = The game could not be started.
join-heading = Join a local game
join-code-label = Join code
join-code-hint = Six characters, for example { $example }; case, spaces and dots are ignored.
join-code-invalid = Enter the six-character code shown in the host's tab.
join-submit = Join
join-connecting-hint = If nothing happens, check that the host's tab is still open.

## Connection problems
status-disconnected-detail = The connection to the host was lost; if the host's tab was closed or reloaded, its game has ended.
rejected-unknown-room = No game with that code is open in this browser.
rejected-room-full = That game already has two players.
rejected-protocol-version = This page is out of date; reload it and try again.
rejected-superseded = This seat was opened in another tab.
rejected-other = The host refused the connection.
rejected-other-online = The game server refused the connection.
rejected-wrong-pin = That PIN isn't right.
rejected-pin-locked = Too many wrong PINs were entered for that seat. Try again in 15 minutes, or ask your opponent to let you in.

## Table
table-heading = Table
table-round = Round { $round }
table-round-showdown = Round { $round } · Showdown
table-status = Status: { $status }
opponent-heading = Opponent: { $name }
opponent-connected = Connected
opponent-not-connected = Not connected
opponent-waiting-for-you = Waiting for you
opponent-plan-sealed = Sealed · { $count ->
        [one] 1 target
       *[other] { $count } targets
    }
my-area-heading = You: { $name }
my-hand-heading = Your hand
my-hand-empty = Your hand is empty.
actions-heading = Actions
log-heading = Game log
log-game-started = The game has started.
game-over-heading = Game over
game-over-won = You win!
game-over-lost = You lose.
# `result` is won or lost, for the player reading it; `winner` and `loser` are names or "You".
game-over-how = { $reason ->
        [health] { $loser } ran out of { $health } in round { $round }.
        [fangs] { $winner } collected enough { $fangs } in round { $round }.
        [crosses] { $winner } collected enough { $crosses } in round { $round }.
       *[resignation] { $loser } resigned in round { $round }.
    }
game-over-markers = Your markers
game-over-view-replay = View replay
rematch = Rematch
rematch-waiting = You asked for a rematch. Waiting for your opponent.
rematch-opponent-ready = Your opponent wants a rematch.
rematch-started = Rematch started: game { $number } in this room.
round-summary = Round { $round } summary
round-summary-set-aside = Set aside: { CHARACTER($character) }
round-summary-badge = { $who ->
        [you] { $player } take
       *[opponent] { $player } takes
    } the { $badge } for round { $next }.

## Markers and cards
count-health = Health: { $n }
count-cross = Crosses: { $n }
count-fang = Fangs: { $n }
count-hourglass = Hourglasses: { $n }
count-placed = Hourglasses placed: { $n }
count-hand = Cards in hand: { $n }
holds-potion = Holds the Potion
holds-badge = Holds the Badge
plan-status-none = Plan: not sealed yet
plan-status-hidden = Plan: sealed, with { $count ->
        [one] 1 target card
       *[other] { $count } target cards
    }
plan-status-revealed = Plan: { $plan }
card-character =
    { CHARACTER($character) }, initiative { $initiative }, { $faction }
card-fool = The Fool
count-badge = Badge: { $n }
count-potion = Potion: { $n }
# Starts with the card's visible text in the order it is drawn: the initiative, then the name.
card-name =
    { $initiative }, { CHARACTER($character) }, { $faction }. { $ability }
card-fool-name = The Fool. { $ability }

## Card abilities, in our own words; each marker named is an argument, so it can be drawn as a token
card-ability-hunter = You may spend a { $cross } to attack up to 2 Werewolves.
card-ability-wolf-king = Attack any number of Humans. Each Human after the first costs a { $fang }, or there is no attack.
card-ability-knight = Gain an { $hourglass }, then attack a Werewolf.
card-ability-wolfen = Gain an { $hourglass }, then attack any character.
card-ability-seer = Attack a Werewolf. A hit costs your opponent 2 Health.
card-ability-witch = Gain the { $potion }. Can only target the Fool.
card-ability-wolf-beauty = Gain a { $fang }, then attack any character.
card-ability-villager = Gain a { $cross }. Can only target the Fool.
card-ability-fool = No effect. Add it to any plan to bluff.

## Card text, drawn on large and medium cards; its words also appear in the matching card-ability message
card-text-hunter = Spend a { $cross } to attack up to 2 Werewolves.
card-text-wolf-king = Attack Humans. Each after the first costs a { $fang }.
card-text-knight = Gain an { $hourglass }, then attack a Werewolf.
card-text-wolfen = Gain an { $hourglass }, then attack any character.
card-text-seer = Attack a Werewolf. A hit costs 2 Health.
card-text-witch = Gain the { $potion }. Can only target the Fool.
card-text-wolf-beauty = Gain a { $fang }, then attack any character.
card-text-villager = Gain a { $cross }. Can only target the Fool.
card-text-fool = No effect. Add it to any plan to bluff.

## How to read abilities
legend-heading = How to read abilities
legend-gain = Gain
legend-gain-text = Gain the marker shown.
legend-attack = Attack
legend-attack-text = Attack one character for each shape.
legend-shape-werewolf = Werewolf
legend-shape-human = Human
legend-shape-any = Any character
legend-damage = Extra damage
legend-damage-text = A hit costs 2 Health instead of 1.
legend-spend = Spend
legend-spend-text = Spend the marker before the arrow to make this attack.

## Phases
phase-plan = Choose a character and its targets, then seal your plan.
phase-reveal-hourglass = Choose how many Hourglasses to place on your character.
phase-reveal-potion = Choose a card for the Potion to target.
phase-hunter-choice = Your Hunter is resolving: choose whether to spend a Cross to attack.
phase-round-over = The round is over.
phase-final-showdown = The last round's results are in.
phase-waiting = Waiting for your opponent.
phase-none = Nothing to do right now.
phase-step-plan = Plan
phase-step-reveal = Reveal
phase-step-potion = Potion
phase-step-showdown = Showdown
phase-step-round-over = Round over

## Plan builder
plan-heading = Your plan
plan-targets-heading = Targets
plan-summary = Plan: { $plan }
plan-summary-empty = Choose a character
plan-seal = Seal plan
plan-seal-incomplete = This is not a complete plan yet.
plan-character-not-offered = This character can't be played this round.
target-not-allowed = The chosen character can't target this card.
target-limit = Remove a target first: this plan can't take another.
plan-summary-short = { CHARACTER($character) } → { $targets }
plan-summary-short-none = { CHARACTER($character) } → no targets
plan-summary-fool = Fool
plan-confirm-title = Seal this plan?
plan-confirm-cancel = Keep choosing

## Reveal
reveal-heading = Reveal
reveal-hourglasses-heading = Spend Hourglasses
reveal-stepper = Hourglasses to place
reveal-hourglass-instruction = How many Hourglasses will you place?
reveal-fewer = Fewer Hourglasses
reveal-more = More Hourglasses
reveal-initiative = { CHARACTER($character) }: initiative { $effective } (printed { $printed })
reveal-initiative-label = { CHARACTER($character) } initiative
reveal-initiative-change = { $printed } → { $effective }
reveal-order-note = Lower initiative resolves first.
reveal-potion-heading = Choose the Potion target
reveal-potion-confirm = Choose a card first

## Showdown
showdown-heading = Showdown
showdown-next = Next result
showdown-empty = The results appear here as the showdown resolves.
showdown-hunter-heading = Your Hunter
showdown-out-yours = { $owner } { CHARACTER($character) } is eliminated and doesn't act.
showdown-out-opponent = { $owner }'s { CHARACTER($character) } is eliminated and doesn't act.
plan-panels-heading = Plans

## Player sides in the reveal and showdown
side-you = You
side-opponent = Opponent
side-initiative = Initiative { $initiative }
side-initiative-changed = Initiative { $printed } → { $effective }
side-initiative-hidden = Initiative ?
side-target = → { $target }
side-more-targets = +{ $n }
side-pill = +{ $n }
side-pill-choosing = +?
side-placed = Placed { $n ->
        [one] 1 Hourglass
       *[other] { $n } Hourglasses
    }
side-placed-choosing = Still choosing Hourglasses
side-label = { $who }: { $plan }. Initiative { $initiative }.
side-label-changed = { $who }: { $plan }. Initiative { $effective } (printed { $printed }).
side-label-hidden = { $who }: character face down, initiative unknown.
side-label-ordered = { $label } { $position ->
        [1] Acts first.
       *[other] Acts second.
    }

## Table layout
table-you = You
drawer-summary = Game log and rules
drawer-full-rules = Full rules
rules-heading = Rules
rules-order = Lower initiative resolves first.
rules-tiebreak-hourglasses-then-badge = On a tie, the player who placed more Hourglasses goes first, then the Badge holder.
rules-tiebreak-badge-only = On a tie, the Badge holder goes first.
announcer-label = Announcements
describe-button = Describe table

## Rules hints
hint-plan = Your opponent sees how many target cards you choose, but not which ones.
hint-place-hourglasses = Each Hourglass you place lowers your character's initiative by 1.
hint-choose-potion-target = If your opponent played the card you name, it's eliminated before anything else resolves.
hint-hunter-choice = Without spending a Cross, your Hunter doesn't attack.
hint-next-round = The Badge passes to the other player for the next round.

## Table description
describe-round = Round { $round }.
describe-hand = Your hand: { $cards }.
describe-hand-empty = Your hand is empty.
describe-my-markers = Your markers: { $markers }.
describe-opponent-markers = Your opponent's markers: { $markers }.
describe-opponent-hand = Your opponent has { $n ->
        [one] 1 card
       *[other] { $n } cards
    } in hand.
describe-my-plan = Your plan: { $plan }.
describe-my-plan-none = You haven't sealed a plan yet.
describe-my-plan-hidden = You've sealed a plan with { $count ->
        [one] 1 target card
       *[other] { $count } target cards
    }.
describe-opponent-plan = Your opponent's plan: { $plan }.
describe-opponent-plan-none = Your opponent hasn't sealed a plan yet.
describe-opponent-plan-hidden = Your opponent has sealed a plan with { $count ->
        [one] 1 target card
       *[other] { $count } target cards
    }.
describe-potion-target = Potion target: { CHARACTER($card) }.
describe-order = { $first ->
        [you] Your { CHARACTER($firstCharacter) } resolves first, then your opponent's { CHARACTER($secondCharacter) }.
       *[opponent] Your opponent's { CHARACTER($firstCharacter) } resolves first, then your { CHARACTER($secondCharacter) }.
    }
describe-turn-you = It's your turn.
describe-turn-opponent = It's your opponent's turn.
describe-turn-both = Both of you need to act.
describe-turn-none = Nobody needs to act right now.
app-load-failed = The game could not be loaded; reload the page to try again.

## Problems
problem-last = Last problem: { $detail }
problem-rate-limited = Too many actions in a short time; wait a moment and try again.
problem-other = The host could not use the last message.
problem-other-online = The game server couldn't use the last message.
problem-not-connected = You're not connected at the moment; wait for the connection to come back and try again.
problem-command-not-sent = That action is no longer available.

## Where to play
play-label = Play
play-online = Online
play-device = This device
play-create-hint-online = Play a friend anywhere with a join code.
play-create-hint-device = Two tabs of this browser, to try the game out.
play-join-hint-online = Enter the code your friend shared.
play-join-hint-device = Enter the code shown in the other tab.

## Online: creating a game
create-heading = New game
create-grace-legend = Reconnect grace
create-grace-hint = How long a player who loses their connection has to come back before their opponent may claim the win.
create-grace-option = { $minutes } min
create-badge-legend = Badge (first player)
create-badge-random = Random
create-badge-me = I start
create-badge-opponent = Opponent starts
create-advanced = Advanced
create-tiebreak-legend = Tiebreak
create-tiebreak-hourglasses_then_badge = Hourglasses, then the Badge
create-tiebreak-badge_only = Badge only
create-min-targets-legend = Minimum targets
create-min-targets-hint = How few target cards a plan may name.
create-min-targets-option = { $count }
create-submit = Create game
create-creating = Creating the game
create-failed-rate-limited = Too many games were created from this network recently; try again later.
create-failed-unavailable = The game server is busy or unavailable; try again in a moment.
create-failed-server = The game server isn't responding right now; try again later.
create-failed-network = The game server couldn't be reached; check your connection and try again.
create-failed-other = The game couldn't be created.

## Online: display name
name-title = What should your opponent call you?
name-label = Your name
name-hint = Shown to your opponent. You can change it later in the settings.
name-continue = Continue
name-skip = Skip

## Online: joining a game
online-join-heading = Join a game
online-join-code-invalid = Enter the six-character code your opponent shared.
online-server-other = This game uses a different server: { $host }
online-server-invalid = The server address in this link isn't valid, so the game wasn't opened.
online-join-new = Join as a new player
online-rejoin-pin = Rejoin with PIN
online-room-full-rejoin = Rejoin with your PIN
online-join-other = Join a different game

## Online: inviting
invite-title = Invite a friend
invite-heading = Invite your opponent
invite-code-label = Join code
invite-instructions-resumed = Share the code or the link with your opponent. The game is paused: it continues once they join and you both choose "Resume".
invite-link = Invite link: { $link }
invite-copy-code = Copy code
invite-share = Share link
invite-waiting = Waiting for your opponent…
invite-joined = Your opponent has joined; starting the game…
invite-options = Game options
invite-option-badge-random = Badge: random
invite-option-badge-you = Badge: you start
invite-option-badge-opponent = Badge: your opponent starts
invite-option-tiebreak = Tiebreak: { $rule }
invite-option-min-targets = Minimum targets: { $count }
invite-share-text = Join my game of { -game-name } with the code { $code }.
copy-done = Copied
copy-failed = Couldn't copy; select the text and copy it instead.

## Online: connection
connection-heading = Connection
connection-online = Connected
connection-connecting = Connecting
connection-offline = Connection lost; trying again
connection-hidden = Paused while this page is in the background
connection-stopped = Not connected
connection-server-unavailable = The game server isn't responding. Your game is kept on the server; this link will work again later.
opponent-reconnecting = Waiting for your opponent to reconnect ({ $time })
opponent-reconnect-over = Your opponent didn't reconnect in time.
opponent-still-waiting = Still waiting for your opponent to reconnect.
claim-win = Claim the win
claim-keep-waiting = Keep waiting
claim-confirm = Claim the win? The game ends as if your opponent had resigned.
stop-protocol-version = This page is out of date; reload it and try again.
stop-room-full = That game already has two players.
stop-unknown-room = There's no game with that code; it may have expired. Check the code and try again.
stop-unknown-seat = This device's seat in that game isn't recognised any more.
stop-superseded = Continued on another device.
stop-rejoin-declined = Your opponent didn't let this device in.
stop-rejoin-unavailable = That seat can't be rejoined this way right now. If it's still connected on another device, use the PIN.

## Online: continuing on another device
continue-heading = Continue on another device
continue-instructions = On the other device, open the rejoin link, or choose "Join game" and enter the code, then choose "Rejoin with your PIN".
continue-code = Join code: { $code }
continue-seat = Your seat: { $seat }
continue-link = Rejoin link: { $link }
continue-copy-link = Copy rejoin link
continue-show-pin = Show PIN
continue-hide-pin = Hide PIN
continue-pin = PIN: { $pin }
continue-pin-hint = Keep the PIN to yourself: anyone who has it can take your seat.
continue-qr-hint = Or scan this code with the other device. It holds the rejoin link, not the PIN.

## Online: requests to take a seat
rejoin-request-title = Let this device play as your opponent?
rejoin-request-detail = Someone without the PIN is asking to take your opponent's seat. Only allow it if your opponent asked you to.
rejoin-allow = Allow
rejoin-deny = Don't allow
pin-attempt-failed = Someone entered a wrong PIN for your opponent's seat.

## Game menu
menu-summary = Game menu
sheet-close = Close
menu-pause = Pause after this round

## Pausing
pause-heading = Pause
pause-requested-you = You asked to pause after this round. Waiting for your opponent to agree.
pause-requested-opponent = Your opponent asks to pause after this round.
pause-accept = Agree to pause
pause-decline = Keep playing
pause-cancel = Cancel the pause
pause-agreed = Pause agreed: applies at the end of the round
paused-heading = Game paused
paused-detail = The game is kept on the server, and this device has a save of it. Check the round and markers below before you resume.
resume = Resume
resume-waiting = You're ready to resume. Waiting for your opponent.
resume-opponent-ready = Your opponent is ready to resume.

## Saves
save-room-gone = That game's room has closed, but this device kept a save of it.
save-resume = Resume from save
save-resuming = Creating a room from the save
save-failed-invalid = The game server didn't accept the save.

## Resigning
resign = Resign
resign-confirm = Resign this game? Your opponent wins.
resign-cancel = Keep playing

## Online: rejoining
rejoin-heading = Rejoin a game
rejoin-seat-legend = Which player were you?
rejoin-seat-missing = Choose which player you were.
rejoin-pin-label = PIN
rejoin-pin-hint = Four digits, shown under "Continue on another device" on the device you played on.
rejoin-pin-invalid = Enter the four-digit PIN, or choose "I don't know my PIN".
rejoin-submit = Rejoin
rejoin-ask = I don't know my PIN
rejoin-ask-hint = Your opponent will be asked to let this device in.
rejoin-waiting-approval = Waiting for your opponent to let this device in.
rejoin-joined = Rejoined; opening the game.

## Online: shared
countdown = { $minutes }:{ NUMBER($seconds, minimumIntegerDigits: 2) }
server-confirm = Connect to { $host }? Only continue if you trust it.
server-continue = Continue
server-cancel = Cancel
opponent-disconnected = Your opponent has disconnected.
opponent-reconnected = Your opponent has reconnected.
rejoin-request-expires = Expires in { $time }

## History
history-heading = History
history-stats-link = Stats
history-empty = No finished games yet. Online games you finish are kept here, on this device only.
history-won = Won
history-lost = Lost
history-summary = { $result } against { $opponent }
# A row of the history list: `result` (Won or Lost) is drawn in bold.
history-row-title = { $result } vs { $opponent }
history-meta = { $date }, { $rounds ->
        [one] 1 round
       *[other] { $rounds } rounds
    }, { $reason }
history-row-meta = { $date } · { $rounds ->
        [one] 1 round
       *[other] { $rounds } rounds
    } · { $reason }
history-played = Played
history-won-by = Won by { $reason }
history-replay = Replay
history-replay-label = Replay: { $summary }, { $meta }
reason-health = Health
reason-fangs = Fangs
reason-crosses = Crosses
reason-resignation = Resignation

## Replay
replay-heading = Replay
replay-menu = Replay menu
replay-missing = This game is not on this device.
replay-unplayable = This game was played under older rules and can't be replayed.
replay-position = Step { $step } of { $total }, round { $round }
replay-controls = Replay controls
replay-previous-step = Previous step
replay-next-step = Next step
replay-previous-round = Previous round
replay-next-round = Next round
replay-keys-hint = The left and right arrow keys step back and forward.
replay-view-group = Viewpoint
replay-view-mine = My view
replay-view-full = Full
replay-command = { $who } chose: { $command }
replay-hands-heading = Hands
replay-hand-of = { $name }'s hand
replay-hand-hidden = { $n ->
        [one] 1 card, hidden
       *[other] { $n } cards, hidden
    }
replay-hand-empty = No cards
replay-log-heading = Events at this step
replay-log-empty = Nothing happened at this step.
replay-log-above = What happened is shown above.

## Stats
stats-heading = Stats
stats-overall-caption = Overall
stats-empty = No finished games yet, so there are no stats.
stats-games = Games played: { $n }
stats-record = Won { $won }, lost { $lost }
stats-average-rounds = Average rounds per game: { $n }
stats-conditions-caption = Results by win condition
stats-picks-caption = Characters picked
stats-picks-note = Your own picks only. A pick succeeds when its character then gained a marker or hit with an attack.
stats-opponents-caption = Results by opponent
stats-col-condition = Win condition
stats-col-character = Character
stats-col-opponent = Opponent
stats-col-won = Won
stats-col-lost = Lost
stats-col-picked = Picked
stats-col-succeeded = Succeeded
stats-col-rate = Success rate
stats-rate = { $percent }%
stats-rate-none = Not picked
