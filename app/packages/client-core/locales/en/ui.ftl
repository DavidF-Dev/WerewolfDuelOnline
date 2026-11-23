# Werewolf: Duel! interface text (British English, sentence case).

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
home-online-heading = Play online
home-create-online = Create a game
home-join-online = Join a game
home-rejoin-online = Rejoin a game
home-local-heading = Play on this device
home-host = Host a local game
home-join = Join a local game
footer-made-by = Made by { -author }
footer-unofficial = An unofficial digital version of { -game-name }
footer-not-affiliated = Not affiliated with { -publisher }.
footer-get-game = Get the physical game ↗
footer-get-game-label = Get the physical game (opens in a new tab)
back-home = Back to home
back = Back

## Home: continue and more
home-continue-heading = Continue
home-continue-session = { $opponent }, room { $room }
home-opponent-unknown = Unknown opponent
home-status-paused = Paused
home-status-active = In progress
home-status-finished = Game over · rematch possible
home-more-heading = More
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

## Character reference
reference-heading = How to play
reference-characters-heading = Characters
reference-characters-intro = Every character and the Fool, with what each does when it resolves. Lower initiative resolves first.

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
settings-reading = Reading
settings-text-size = Text size: { $percent }%
settings-reading-font = Reading font
settings-font-default = Default
settings-extra-spacing = Extra letter and line spacing
settings-card-text = Card text
settings-card-text-icons = Icons and text
settings-card-text-only = Text only
settings-accessibility = Accessibility
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
settings-deduction-auto-mark = Deduction auto-mark
settings-network = Network
settings-server = Server
settings-server-default = Default
settings-server-custom = Custom
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
settings-about-link = About this app
toggle-on = ON
toggle-off = OFF

## About
about-heading = About
about-version = Version { $version }
about-credits-heading = Credits
about-credit-line = { $name }, { $licence }
about-theme-credit = Artwork: { $credit }
about-fonts-notice = The fonts are used under the { $licence }.
about-licences-heading = Licences

## Host and join
host-heading = Host a local game
host-code-label = Join code
host-instructions = Open this page in another tab of this browser, choose "Join a local game" and enter this code.
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
table-status = Status: { $status }
opponent-heading = Opponent: { $name }
opponent-connected = Connected
opponent-not-connected = Not connected
my-area-heading = You: { $name }
my-hand-heading = Your hand
my-hand-empty = Your hand is empty.
actions-heading = Actions
log-heading = Game log
log-game-started = The game has started.
game-over-heading = Game over
replay-verified = The game record was checked and matches what you saw.
replay-unverified = The game record could not be verified.
game-over-view-replay = View replay
rematch = Rematch
rematch-hint = Play again in the same room, with the Badge going to whoever lost.
rematch-waiting = You asked for a rematch. Waiting for your opponent.
rematch-opponent-ready = Your opponent wants a rematch.
rematch-started = Rematch started: game { $number } in this room.
round-summary = Round { $round } summary

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
    { $name }, initiative { $initiative }, { $faction }
card-fool = The Fool
count-badge = Badge: { $n }
count-potion = Potion: { $n }
marker-health = Health
marker-badge = Badge
# Starts with the card's visible text in the order it is drawn: the initiative, then the name.
card-name =
    { $initiative }, { $name }, { $faction }. { $ability }
card-fool-name = The Fool. { $ability }

## Card abilities, in our own words
card-ability-hunter = You may spend a Cross to attack up to 2 Werewolves.
card-ability-wolf-king = Attack any number of Humans. Each Human after the first costs a Fang, or there is no attack.
card-ability-knight = Gain an Hourglass, then attack a Werewolf.
card-ability-wolfen = Gain an Hourglass, then attack any character.
card-ability-seer = Attack a Werewolf. A hit costs your opponent 2 health.
card-ability-witch = Gain the Potion. Can only target the Fool.
card-ability-wolf-beauty = Gain a Fang, then attack any character.
card-ability-villager = Gain a Cross. Can only target the Fool.
card-ability-fool = No effect. Add it to any plan to bluff.

## Phases
phase-plan = Choose a character and its targets, then seal your plan.
phase-reveal-hourglass = Choose how many Hourglasses to place on your character.
phase-reveal-potion = Choose a card for the Potion to target.
phase-hunter-choice = Your Hunter is resolving: choose whether to spend a Cross to attack.
phase-round-over = The round is over.
phase-waiting = Waiting for your opponent.
phase-none = Nothing to do right now.

## Plan builder
plan-heading = Your plan
plan-characters-heading = Choose a character
plan-targets-heading = Choose targets
plan-summary = Plan: { $plan }
plan-summary-empty = Choose a character to start a plan.
plan-seal = Seal plan
plan-seal-incomplete = This is not a complete plan yet.
target-not-allowed = The chosen character can't target this card.
target-limit = Remove a target first: this plan can't take another.
target-choose-character-first = Choose a character first.
potion-target = Potion target: { $card }
plan-detail = { $name }: { $ability }
plan-target-in-hand = In your hand: no effect
plan-summary-short = { $character } → { $targets }
plan-summary-short-none = { $character } → no targets
plan-summary-fool = Fool
plan-confirm-title = Seal this plan?
plan-confirm-cancel = Keep choosing

## Reveal
reveal-heading = Reveal
reveal-hourglasses-heading = Place Hourglasses
reveal-fewer = Fewer Hourglasses
reveal-more = More Hourglasses
reveal-initiative = { $character }: initiative { $effective } (printed { $printed })
reveal-opponent-placed = Your opponent placed { $n ->
        [one] 1 Hourglass
       *[other] { $n } Hourglasses
    }.
reveal-potion-heading = Choose the Potion target

## Showdown
showdown-heading = Showdown
showdown-next = Next result
showdown-empty = The results appear here as the showdown resolves.
showdown-hunter-heading = Your Hunter

## Table layout
table-area-heading = In play
table-you = You
table-plan = { $name }: { $status }
initiative-heading = Showdown order
initiative-entry = { $position }. { $name }: { $character }, initiative { $initiative }
initiative-entry-unknown = { $position }. { $name }: { $character }
deduction-heading = Deduction
deduction-help = Tap a card to rule it out as your opponent's character, and again to undo.
deduction-possible = Possible
deduction-ruled-out = Ruled out
deduction-mine = In your hand
deduction-revealed = Ruled out: revealed this round
drawer-summary = Game log and rules
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
describe-potion-target = Potion target: { $card }.
describe-order = { $first ->
        [you] Your { $firstCharacter } resolves first, then your opponent's { $secondCharacter }.
       *[opponent] Your opponent's { $firstCharacter } resolves first, then your { $secondCharacter }.
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

## Online: creating a game
create-heading = Create an online game
create-grace-legend = Reconnect time
create-grace-hint = How long a player who loses their connection has to come back before their opponent may claim the win.
create-grace-option = { $minutes } minutes
create-badge-legend = Who starts with the Badge
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
create-submit = Create the game
create-creating = Creating the game
create-failed-rate-limited = Too many games were created from this network recently; try again later.
create-failed-unavailable = The game server is busy or unavailable; try again in a moment.
create-failed-server = The game server isn't responding right now; try again later.
create-failed-network = The game server couldn't be reached; check your connection and try again.
create-failed-other = The game couldn't be created.

## Online: display name
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
online-join-other = Join a different game

## Online: inviting
invite-heading = Invite your opponent
invite-code-label = Join code
invite-instructions = Share the code or the link with your opponent. The game starts when they join.
invite-instructions-resumed = Share the code or the link with your opponent. The game is paused: it continues once they join and you both choose "Resume".
invite-link = Invite link: { $link }
invite-copy-code = Copy code
invite-copy-link = Copy link
invite-share = Share
invite-qr-note = Scan this code to open the invite link.
invite-waiting = Waiting for your opponent to join
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
continue-instructions = On the other device, open the rejoin link, or choose "Rejoin a game" and enter the code, then enter the PIN.
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
history-meta = { $date }, { $rounds ->
        [one] 1 round
       *[other] { $rounds } rounds
    }, { $reason }
history-replay = Replay
history-replay-label = Replay: { $summary }, { $meta }
reason-health = Health
reason-fangs = Fangs
reason-crosses = Crosses
reason-resignation = Resignation

## Replay
replay-heading = Replay
replay-missing = This game is not on this device.
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
replay-player-heading = { $name }
replay-hand-heading = Hand
replay-hand-hidden = { $n ->
        [one] 1 card, hidden
       *[other] { $n } cards, hidden
    }
replay-hand-empty = No cards
replay-log-heading = Events at this step
replay-log-empty = Nothing happened at this step.

## Stats
stats-heading = Stats
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
