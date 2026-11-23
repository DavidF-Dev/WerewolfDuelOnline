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
target-in-hand = This card is in your hand, so targeting it has no effect.
target-choose-character-first = Choose a character first.
potion-target = Potion target: { $card }

## Table description
describe-hand = Your hand: { $cards }
describe-markers =
    { $name }: { $markers }
describe-pending = Waiting for: { $seats }
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
create-submit = Create the game
create-creating = Creating the game
create-failed-rate-limited = Too many games were created from this network recently; try again later.
create-failed-unavailable = The game server is busy or unavailable; try again in a moment.
create-failed-network = The game server couldn't be reached; check your connection and try again.
create-failed-other = The game couldn't be created.

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
invite-link = Invite link: { $link }
invite-copy-code = Copy code
invite-copy-link = Copy link
invite-share = Share
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

## Online: requests to take a seat
rejoin-request-title = Let this device play as your opponent?
rejoin-request-detail = Someone without the PIN is asking to take your opponent's seat. Only allow it if your opponent asked you to.
rejoin-allow = Allow
rejoin-deny = Don't allow
pin-attempt-failed = Someone entered a wrong PIN for your opponent's seat.

## Online: resigning
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
