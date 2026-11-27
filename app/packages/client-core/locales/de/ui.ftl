# Werewolf: Duel! interface text (German). The player is "du"; the opponent is "dein Gegenüber".
# A `character`, `card`, `firstCharacter` or `secondCharacter` argument is a character id, named
# with CHARACTER as the engine messages describe; a `cards` or `targets` list may declare
# `.list-case` and `.list-article` for its items.

## Connection status
status-connecting = Verbindung wird hergestellt
status-waiting = Warten auf ein Gegenüber
status-playing = Im Spiel
status-game-over = Spiel vorbei
status-disconnected = Getrennt
status-rejected = Beitritt zum Raum nicht möglich

## Names
-game-name = Werewolf: Duel!
-author = David F Dev
-publisher = Whales Entertainment
app-title =
    { -game-name } Online

## Home
home-create-online = Neues Spiel
home-join-online = Spiel beitreten
footer-made-by = Erstellt von { -author }
footer-unofficial = Eine inoffizielle digitale Version von { -game-name }
footer-not-affiliated = Steht in keiner Verbindung zu { -publisher }.
footer-get-game = Das Kartenspiel kaufen ↗
footer-get-game-label = Das Kartenspiel kaufen (öffnet in einem neuen Tab)
back = Zurück

## Home: continue and more
home-continue-heading = Weiterspielen
home-status-line = { $status } · { $when }
home-status-turn = Runde { $round } · du bist dran · { $when }
home-status-waiting = Runde { $round } · dein Gegenüber ist dran · { $when }
home-status-round = Runde { $round } · { $when }
home-status-paused-round = Pausiert · Runde { $round } · { $when }
home-resume = Fortsetzen
home-open = Öffnen
home-open-label = Spiel mit { $opponent } öffnen, Raum { $room }
home-resume-label = Spiel mit { $opponent } fortsetzen, Raum { $room }
home-opponent-unknown = Unbekannt
home-status-paused = Pausiert
home-status-active = Läuft
home-status-finished = Spiel vorbei · Revanche möglich
home-more-label = Mehr zum Spiel mit { $opponent }
home-more-label-unknown = Mehr zum Spiel mit unbekanntem Gegenüber
home-remove = Von diesem Gerät entfernen
home-remove-title = Dieses Spiel entfernen?
home-remove-body = Du kannst es auf diesem Gerät dann nicht mehr fortsetzen. Läuft das Spiel noch, kann dein Platz verfallen, und dein Gegenüber gewinnt vielleicht. Um später wieder einzusteigen, brauchst du den Beitrittscode und deine PIN.
home-remove-body-finished = Im Verlauf bleibt es erhalten.
home-remove-confirm = Entfernen
home-remove-cancel = Abbrechen
home-removed = Spiel entfernt
home-remove-failed = Das Spiel konnte nicht entfernt werden. Versuch es noch einmal.
home-how-to-play = So wird gespielt
home-history = Verlauf
home-settings = Einstellungen

## Installing and updating
install-card-heading = App installieren
install-card-text = Installiere sie, dann öffnet sie sich wie jede andere App in einem eigenen Fenster.
install-card-text-ios = Füge sie zum Home-Bildschirm hinzu, dann öffnet sie sich wie jede andere App, und deine gespeicherten Spiele sind sicher.
install-card-dismiss = Ausblenden
install-button = Installieren
install-ios-steps = Tippe auf „Teilen“ und dann auf „Zum Home-Bildschirm“.
update-region = App-Updates
update-available = Eine neue Version ist da
update-reload = Neu laden

## How to play
how-to-play-heading = So wird gespielt
how-to-play-tutorial-heading = Neu im Spiel?
how-to-play-tutorial-text = Spiel eine angeleitete Runde gegen { -tutorial-opponent }. Das dauert etwa fünf Minuten, und du kannst jederzeit aufhören.
how-to-play-tutorial-done-heading = Tutorial abgeschlossen
how-to-play-tutorial-again = Noch einmal spielen
how-to-play-start-tutorial = Tutorial starten
how-to-play-rules-heading = Regeln

## Rules pages, in our own words: one message per paragraph
# Marker words are arguments, so that their tokens are drawn: `cross`, `crosses`, `fang`, `fangs`,
# `hourglass`, `hourglasses`, `potion`, `health` and `badge`. A character is named with CHARACTER
# and an argument named after it: `hunter`, `wolfKing`, `knight`, `wolfen`, `seer`, `witch`,
# `wolfBeauty` or `villager`.
rules-progress = Regeln · { $index } von { $total }
rules-pages = Regelseiten
rules-previous = Zurück
rules-next = Weiter
rules-sheet-title = Regeln

rules-goal-title = Das Ziel
rules-goal-summary = Drei Wege zum Sieg.
rules-goal-intro = In jeder Runde wählen du und dein Gegenüber heimlich je einen Charakter, und dann sind die beiden Charaktere nacheinander dran. Du gewinnst, sobald eines davon zutrifft:
rules-goal-crosses = Du hast 4 { $crosses }.
rules-goal-fangs = Du hast 3 { $fangs }.
rules-goal-health = Dein Gegenüber hat kein { $health } mehr.
rules-goal-instant = Das Spiel endet in dem Moment, in dem eines davon eintritt, auch mitten in einer Runde. Darum zählt die Reihenfolge, in der die Charaktere dran sind. Hast du selbst kein { $health } mehr, verlierst du.
rules-goal-bluff = Die Hand deines Gegenübers siehst du nie. Jede Runde ist ein Raten, welchen Charakter dein Gegenüber gewählt hat, und eine Gelegenheit, deine eigene Wahl schwer durchschaubar zu machen.

rules-setup-title = Vorbereitung
rules-setup-summary = { $health }, { $crosses }, das { $badge } und die erste { $hourglass }.
rules-setup-cards = Es gibt 8 Charaktere. Die Zahl auf jedem ist seine Initiative: Je niedriger sie ist, desto früher ist der Charakter dran. Jeder Charakter ist ein Mensch oder ein Werwolf, und davon hängt ab, welche Charaktere ihn als Ziel wählen können. Du und dein Gegenüber habt außerdem je 9 Zielkarten: eine für jeden Charakter und eine für den Narren.
rules-setup-markers = Du und dein Gegenüber beginnt mit je 2 { $health } und 1 { $cross }.
rules-setup-badge = Einer von euch beginnt mit dem { $badge }: Der Host bestimmt, wer, oder überlässt es dem Zufall. Wer das { $badge } hat, bekommt eine Karte mehr und entscheidet zuerst, und nach jeder Runde wechselt das { $badge } die Seite.
rules-setup-hourglass = Wer ohne das { $badge } beginnt, nimmt 1 { $hourglass }.
rules-setup-supply = Die übrigen Marker bilden den Vorrat. Ein Marker, den du erhältst, kommt aus dem Vorrat, und ein Marker, den du ausgibst, geht dorthin zurück.

rules-round-title = Eine Runde
rules-round-summary = Austeilen, Plan, Aufdecken, Auflösung, Rundenende.
rules-round-intro = Jede Runde hat dieselben fünf Schritte.
rules-round-deal-title = Austeilen
rules-round-deal = Die 8 Charaktere werden gemischt, und einer wird verdeckt beiseitegelegt, ohne dass einer von euch ihn sieht. Wer das { $badge } hat, bekommt 4 der übrigen, der andere Spieler 3. Deine Hand siehst nur du.
rules-round-plan-title = Plan
rules-round-plan = Gleichzeitig machen du und dein Gegenüber je einen Plan: einen Charakter aus deiner Hand und mindestens eine Zielkarte mit dem Charakter, den dein Gegenüber deiner Meinung nach gewählt hat. Auf der Karte jedes Charakters steht, worauf er zielen darf, und der Narr passt in jeden Plan.
rules-round-plan-2 = Ist dein Plan fertig, versiegelst du ihn. Dein Gegenüber erfährt, wie viele Zielkarten du gewählt hast, aber nicht welche. Der Rest deiner Hand wird ungesehen abgelegt.
rules-round-reveal-title = Aufdecken
rules-round-reveal = Hast du { $hourglasses }, darfst du einige oder alle davon auf deinen gewählten Charakter setzen. Wer das { $badge } hat, wählt zuerst, dann der andere Spieler, der diese Zahl kennt. Jede gesetzte { $hourglass } senkt die Initiative des Charakters um 1, aber nie unter 0.
rules-round-reveal-2 = Hast du den { $potion }, musst du ihn jetzt einsetzen: Nenne einen Charakter, der dir in dieser Runde nicht ausgeteilt wurde.
rules-round-reveal-3 = Dann werden beide Pläne aufgedeckt.
rules-round-showdown-title = Auflösung
rules-round-showdown = Zuerst wirkt der { $potion }. Nennt er den Charakter des anderen Spielers, ist dieser Charakter ausgeschaltet, bevor überhaupt ein Charakter dran ist, und sein Besitzer verliert 1 { $health }.
rules-round-showdown-2 = Dann sind die Charaktere dran, die niedrigste Initiative zuerst. Bei Gleichstand ist zuerst der Charakter mit mehr gesetzten { $hourglasses } dran, sonst der des Spielers mit dem { $badge }. Ein Charakter erhält zuerst seine Marker oder gibt sie aus und greift dann seine Ziele an.
rules-round-showdown-3 = Ein Angriff trifft, wenn eines seiner Ziele den Charakter des anderen Spielers nennt und dieser Charakter noch nicht dran war. Der getroffene Charakter ist ausgeschaltet und kommt nicht mehr dran, und sein Besitzer verliert 1 { $health }, oder 2, wenn { CHARACTER($seer, article: "def") } trifft.
rules-round-end-title = Rundenende
rules-round-end = Die gesetzten { $hourglasses } gehen in den Vorrat zurück, das { $badge } geht an den anderen Spieler, und die beiseitegelegte Karte wird euch beiden gezeigt. Sobald ihr beide bereit seid, wird die nächste Runde ausgeteilt.

rules-markers-title = Die Marker
rules-markers-summary = Was jeder Marker tut und woher er kommt.
rules-markers-intro = Alle Marker, die du und dein Gegenüber habt, sind für euch beide sichtbar.
rules-markers-cross = Mit 4 gewinnst du. Ihr beginnt mit je 1, { CHARACTER($villager, article: "def") } erhält 1, und { CHARACTER($hunter, article: "def") } gibt 1 aus, um anzugreifen.
rules-markers-fang = Mit 3 gewinnst du. Einen erhält { CHARACTER($wolfBeauty, article: "def") }, und { CHARACTER($wolfKing, article: "def") } gibt welche aus, um mehr als einen Menschen anzugreifen.
rules-markers-hourglass = Beim Aufdecken auf deinen Charakter gesetzt, senkt jede seine Initiative um 1. Wer das { $badge } nicht hat, beginnt mit 1, und { CHARACTER($knight, article: "def") } und { CHARACTER($wolfen, article: "def") } erhalten je 1.
rules-markers-potion = Ihn erhält { CHARACTER($witch, article: "def") }. Wer ihn hat, muss beim nächsten Aufdecken einen Charakter nennen; hat der andere Spieler diesen Charakter gespielt, ist dieser Charakter ausgeschaltet, bevor überhaupt ein Charakter dran ist. Danach geht der { $potion } in den Vorrat zurück.
rules-markers-health = Du beginnst mit 2 und bekommst nie etwas zurück. Ist keines mehr übrig, verlierst du.
rules-markers-badge = Wer es hat, bekommt 4 Karten statt 3, entscheidet zuerst über { $hourglasses } und ist bei einem Gleichstand zuerst dran, den die gesetzten { $hourglasses } nicht entscheiden. Nach jeder Runde geht es an den anderen Spieler.

rules-characters-title = Charaktere
rules-characters-summary = Alle Charaktere und wie du ihre Fähigkeiten liest.

rules-fine-points-title = Feinheiten
rules-fine-points-summary = Gleichstand, der { $potion }, der Narr und weitere Details.
rules-fine-points-ties-title = Gleichstand
rules-fine-points-ties = Haben beide Charaktere am Ende dieselbe Initiative, ist der mit mehr gesetzten { $hourglasses } zuerst dran. Ist auch das gleich, ist der Charakter des Spielers mit dem { $badge } zuerst dran.
rules-fine-points-empty-supply-title = Keine { $hourglasses } mehr
rules-fine-points-empty-supply = Gesetzte { $hourglasses } bleiben bis zum Rundenende auf den Charakteren, daher kann der Vorrat leer werden. Erhält { CHARACTER($knight, article: "def") } oder { CHARACTER($wolfen, article: "def") } dann eine { $hourglass }, wird sie stattdessen dem anderen Spieler genommen. Hat auch der keine, gibt es nichts.
rules-fine-points-immune-title = Zu spät für einen Treffer
rules-fine-points-immune = Ein Angriff trifft nur einen Charakter, der noch nicht dran war. Ein Charakter, der schon dran war, ist also für den Rest der Runde sicher. Ein Charakter wird nur einmal ausgeschaltet: Ein weiterer Treffer, auch nach dem { $potion }, bewirkt nichts mehr.
rules-fine-points-potion-title = Der { $potion }
rules-fine-points-potion = Der { $potion } kann jeden Charakter nennen, der dir in dieser Runde nicht ausgeteilt wurde, ob gespielt oder nicht, auch einen, auf den dein eigener Plan zielt. Er wirkt auf jeden Charakter, auch auf { CHARACTER($witch, case: "acc", article: "def") }. Der Narr ist kein Charakter und kann nicht genannt werden.
rules-fine-points-wolf-king-title = { CHARACTER($wolfKing) } und { $fangs }
rules-fine-points-wolf-king = Als Ziele kann { CHARACTER($wolfKing, article: "def") } beliebig viele Menschen wählen. Jeder Mensch nach dem ersten kostet 1 { $fang }, zu zahlen, wenn { CHARACTER($wolfKing, article: "def") } dran ist. Kannst du nicht für alle zahlen, zahlst du nichts, und er greift nicht an. Der Narr kostet nichts.
rules-fine-points-hunter-title = { CHARACTER($hunter) } und { $cross }
rules-fine-points-hunter = Ist { CHARACTER($hunter, article: "def") } dran, entscheidest du, ob du 1 { $cross } ausgibst. Nur dann greift er bis zu 2 Werwölfe an; ohne { $cross } kann er nicht angreifen. Behältst du das { $cross }, rückt der Sieg mit 4 näher.
rules-fine-points-hand-title = Karten auf deiner Hand
rules-fine-points-hand = Eine Karte, die dir ausgeteilt wurde, kann nicht der Charakter sein, den dein Gegenüber spielt. Dein Plan kann sie also nicht als Ziel wählen, und das Spiel bietet sie nicht an. Angeboten werden dir die Charaktere, die du nicht bekommen hast, und der Narr. Darunter sind die Karten deines Gegenübers, aber auch die beiseitegelegte Karte, also ist jedes Ziel geraten.
rules-fine-points-fool-title = Der Narr
rules-fine-points-fool = Der Narr bewirkt nichts. Nimm ihn in einen beliebigen Plan, um zu ändern, wie viele Zielkarten dein Gegenüber sieht, oder mach ihn zu deinem einzigen Ziel, um einen Charakter ohne Angriff zu spielen. Nur auf den Narren zielen können { CHARACTER($witch, article: "def") } und { CHARACTER($villager, article: "def") }.
rules-fine-points-options-title = Regeln, die ein Host ändern kann
rules-fine-points-options = Ältere Auflagen des Spiels entscheiden jeden Gleichstand allein über das { $badge }. Ein Host kann diese Regel beim Erstellen eines Spiels wählen: Ein Gleichstand geht dann immer an den Spieler mit dem { $badge }.
rules-fine-points-options-2 = Ein Host kann auch Pläne ohne Ziele erlauben. Ein Charakter, der ohne Ziele gespielt wird, erhält trotzdem seine Marker, greift aber nicht an.

## Character reference
reference-characters-intro = Alle Charaktere und der Narr, und was jeder tut, wenn er an der Reihe ist. Die niedrigere Initiative ist zuerst dran.
# Shown beside a character's name in languages other than English: its name as the English edition prints it.
reference-printed-name = Im Original: { $name }

## Tutorial
# The scripted opponent's name, defined once; every tutorial message names the opponent through this term.
-tutorial-opponent = Lena
tutorial-opponent-name = { -tutorial-opponent }
tutorial-heading = Tutorial
# Above the coach's text in the phase bar, as in "Tutorial · 2 of 5 · Make a plan".
tutorial-progress = Tutorial · { $step } von { $count } · { $title }
tutorial-next = Weiter
tutorial-finish = Fertig
tutorial-leave = Tutorial beenden
tutorial-starting = Tutorial wird vorbereitet …
tutorial-failed = Das Tutorial konnte nicht starten. Geh zurück und versuch es noch einmal.
# The coach's text for each step: at most three lines at 360 px and 100 % text. Marker words and
# characters are arguments, as in the rules pages.
tutorial-goal-title = Dein Ziel
tutorial-goal-text = Du gewinnst, wenn du 4 { $crosses } oder 3 { $fangs } hast oder { -tutorial-opponent } kein { $health } mehr hat. Diese Markerreihen zählen mit.
tutorial-plan-title = Plan machen
tutorial-plan-text = Die Karten von { -tutorial-opponent } siehst du nicht, also ist jedes Ziel geraten. Die meisten sind Werwölfe: Schick { CHARACTER($knight, case: "acc", article: "def") } auf { CHARACTER($wolfen, case: "acc", article: "def") }.
tutorial-reveal-title = Aufdecken
tutorial-reveal-text = Die niedrigere Initiative ist zuerst dran; dein { CHARACTER($knight) } hat 3. Spielt { -tutorial-opponent } { CHARACTER($wolfen, case: "acc", article: "def") }, auf den du zielst, hat er 4. Jede gesetzte { $hourglass } zieht 1 ab. Setz 0.
tutorial-showdown-title = Auflösung
tutorial-showdown-text = Zuerst ist { CHARACTER($knight, article: "def") } dran: Er erhält eine { $hourglass } und trifft { CHARACTER($wolfen, case: "acc", article: "def") }, der so nicht mehr drankommt. { -tutorial-opponent } verliert 1 { $health }.
tutorial-round-end-title = Rundenende
tutorial-round-end-text = Das { $badge } wechselt die Seite, und die beiseitegelegte Karte wird gezeigt. Ein echtes Spiel geht so weiter, Runde um Runde, bis jemand gewinnt.
tutorial-done-heading = Du hast eine ganze Runde gespielt
tutorial-done-learned = Das hast du gelernt
tutorial-done-goal = Die drei Wege zum Sieg
tutorial-done-plan = Einen Charakter und seine Ziele planen
tutorial-done-reveal = { $hourglasses } und das { $badge }
tutorial-done-showdown = Wer zuerst dran ist und was ein Treffer bewirkt
tutorial-done-more = Ein echtes Spiel geht Runde um Runde weiter, bis jemand gewinnt. Alle Regeln stehen auf den Regelseiten.
tutorial-done-play = Mit jemandem spielen
tutorial-done-rules = Regeln lesen
tutorial-done-again = Tutorial noch einmal spielen

## Home: the newcomer panel
home-newcomer-heading = Neu bei { -game-name }?
home-newcomer-text = Lerne das Spiel in einer angeleiteten Runde.
home-newcomer-learn = Spielen lernen
home-newcomer-dismiss = Ausblenden

## Settings
settings-heading = Einstellungen
settings-general = Allgemein
settings-install = App installieren
settings-installed = Installiert
settings-language = Sprache
settings-language-system = System ({ $language })
settings-theme = Design
settings-theme-system = System
settings-theme-light = Hell
settings-theme-dark = Dunkel
settings-display-name = Anzeigename
settings-display-name-hint = Für dein Gegenüber sichtbar. Lass das Feld leer, um jedes Mal gefragt zu werden.
settings-reading = Lesen & Barrierefreiheit
settings-text-size = Textgröße
settings-text-size-option = { $percent } %
settings-reading-font = Leseschrift
settings-font-default = Standard
settings-extra-spacing = Mehr Zeichen- und Zeilenabstand
settings-card-text = Kartentext
settings-card-text-icons = Symbole und Text
settings-card-text-only = Nur Text
settings-high-contrast = Hoher Kontrast
settings-colour-blind-patterns = Muster für Farbenblinde
settings-reduced-motion = Weniger Bewegung
settings-motion-system = System
settings-motion-on = An
settings-motion-off = Aus
settings-showdown-speed = Ergebnisse
settings-speed-step = Schrittweise
settings-speed-auto = Automatisch
settings-speed-instant = Sofort
settings-haptics = Vibrieren, wenn ich dran bin
settings-gameplay = Spiel
settings-confirm-plan = Vor dem Versiegeln nachfragen
settings-rules-hints = Regelhinweise
settings-network = Netzwerk
settings-server = Server
settings-server-default = Standard
settings-server-custom = Eigener …
settings-server-address = Serveradresse
settings-server-save = Diesen Server verwenden
settings-server-saved = Server gespeichert.
settings-server-invalid = Gib eine Webadresse ein, die mit https:// beginnt (einfaches http:// geht nur für diesen Computer) und weder Benutzernamen noch Passwort enthält.
settings-data = Daten
settings-data-note = Deine Spiele, dein Verlauf und deine Einstellungen werden nur auf diesem Gerät gespeichert.
settings-data-memory-only = Dieser Browser behält deine Daten nicht, also ist nach dem Schließen des Tabs nichts mehr da. Ein Backup kannst du trotzdem exportieren.
settings-data-backup = Backup
settings-data-export = Exportieren
settings-data-import = Importieren
settings-data-history = Spielverlauf
settings-data-clear-history = Verlauf löschen
settings-data-everything = Alles auf diesem Gerät
settings-data-delete-all = Alle Daten löschen
backup-file-label = Backup-Datei
backup-seat-token-warning = Ein Backup enthält die Platz-Tokens dieses Geräts. Wer die Datei hat, kann damit deine Plätze in Online-Spielen übernehmen. Behalte sie für dich und teile sie nicht.
backup-export-title = Backup exportieren?
backup-export-confirm = Exportieren
backup-export-share = Teilen
backup-export-cancel = Abbrechen
backup-saved = Backup gespeichert.
backup-save-failed = Das Backup konnte nicht gespeichert werden.
backup-error-corrupt = Diese Datei ist kein lesbares Backup. Vielleicht ist sie beschädigt oder wurde bearbeitet.
backup-error-checksum = Dieses Backup passt nicht zu seiner Prüfsumme. Es wurde also seit dem Export verändert oder beschädigt.
backup-error-version = Dieses Backup stammt aus einer anderen Version der App und kann hier nicht importiert werden.
backup-import-title = Dieses Backup importieren?
backup-import-confirm = Importieren
backup-import-cancel = Abbrechen
backup-preview-games = { $count ->
        [one] 1 beendetes Spiel
       *[other] { $count } beendete Spiele
    }
backup-preview-sessions = { $count ->
        [one] 1 gespeichertes Online-Spiel
       *[other] { $count } gespeicherte Online-Spiele
    }
backup-preview-skipped = { $count ->
        [one] 1 gespeichertes Online-Spiel in der Datei ist ungültig und wird übersprungen
       *[other] { $count } gespeicherte Online-Spiele in der Datei sind ungültig und werden übersprungen
    }
backup-preview-settings-differ = Die Einstellungen in diesem Backup weichen von deinen ab.
backup-preview-settings-same = Die Einstellungen in diesem Backup entsprechen deinen.
backup-preview-replace-settings = Meine Einstellungen durch die aus dem Backup ersetzen
backup-preview-merge-note = Spiele werden anhand ihrer Kennung zugeordnet; gibt es beide Kopien, bleibt die neuere. Auf diesem Gerät wird nichts entfernt.
backup-import-done = Backup importiert: { $added } neu, { $updated } aktualisiert.
backup-import-failed = Das Backup konnte nicht importiert werden; es wurde nichts geändert.
delete-history-title = Verlauf löschen?
delete-history-intro = Damit wird alles endgültig gelöscht, was auf diesem Gerät über deine beendeten Spiele gespeichert ist:
delete-history-keeps = Deine Einstellungen, dein Anzeigename und deine gespeicherten Online-Spiele bleiben erhalten.
delete-history-confirm = Verlauf löschen
delete-history-done = Verlauf gelöscht.
delete-all-title = Alle Daten löschen?
delete-all-intro = Damit wird alles endgültig gelöscht, was auf diesem Gerät gespeichert ist:
delete-all-confirm = Alle Daten löschen
delete-item-settings = Einstellungen und dein Anzeigename
delete-item-history = Spielverlauf und Statistik
delete-item-games = Pausierte und laufende Spiele, die sich danach nicht mehr fortsetzen lassen
delete-device-only = Das betrifft nur dieses Gerät. Deine Gegenüber behalten ihre eigenen Kopien, und Online-Räume laufen von selbst ab.
delete-export-first = Erst Backup exportieren
delete-cancel = Abbrechen
delete-failed = Die Daten konnten nicht gelöscht werden.
settings-about = Über
settings-credits = Nachweise
settings-licences = Lizenzen
toggle-on = AN
toggle-off = AUS

## About
about-heading = Über
about-version = Version { $version }
about-credits-heading = Nachweise
about-credit-line = { $name }, { $licence }
# The credit for this game's own engine and app.
about-credit-engine = Spiel-Engine und App
about-theme-credit = Grafik: { $credit }
about-fonts-notice = Die Schriften werden unter der { $licence } verwendet.
about-licences-heading = Lizenzen

## Host and join
host-heading = Lokales Spiel hosten
host-code-label = Beitrittscode
host-instructions = Öffne diese App in einem anderen Tab dieses Browsers, wähle „Spiel beitreten“, dann „Dieses Gerät“, und gib diesen Code ein.
host-starting = Spiel wird gestartet
host-failed = Das Spiel konnte nicht gestartet werden.
join-heading = Lokalem Spiel beitreten
join-code-label = Beitrittscode
join-code-hint = Sechs Zeichen, zum Beispiel { $example }; Groß- und Kleinschreibung, Leerzeichen und Punkte zählen nicht.
join-code-invalid = Gib den sechsstelligen Code aus dem Tab des Hosts ein.
join-submit = Beitreten
join-connecting-hint = Wenn nichts passiert, prüfe, ob der Tab des Hosts noch offen ist.

## Connection problems
status-disconnected-detail = Die Verbindung zum Host ist abgebrochen. Wurde sein Tab geschlossen oder neu geladen, ist sein Spiel beendet.
rejected-unknown-room = In diesem Browser ist kein Spiel mit diesem Code offen.
rejected-room-full = Dieses Spiel hat schon zwei Spieler.
rejected-protocol-version = Diese Seite ist veraltet. Lade sie neu und versuch es noch einmal.
rejected-superseded = Dieser Platz wurde in einem anderen Tab geöffnet.
rejected-other = Der Host hat die Verbindung abgelehnt.
rejected-other-online = Der Spielserver hat die Verbindung abgelehnt.
rejected-wrong-pin = Diese PIN stimmt nicht.
rejected-pin-locked = Für diesen Platz wurden zu oft falsche PINs eingegeben. Versuch es in 15 Minuten noch einmal oder bitte dein Gegenüber, dich hereinzulassen.

## Table
table-heading = Tisch
table-round = Runde { $round }
table-round-showdown = Runde { $round } · Auflösung
table-status = Status: { $status }
opponent-heading = Gegenüber: { $name }
opponent-connected = Verbunden
opponent-not-connected = Nicht verbunden
opponent-waiting-for-you = Wartet auf dich
opponent-plan-sealed = Versiegelt · { $count ->
        [one] 1 Ziel
       *[other] { $count } Ziele
    }
my-area-heading = Du: { $name }
my-hand-heading = Deine Hand
my-hand-empty = Deine Hand ist leer.
actions-heading = Aktionen
log-heading = Spielprotokoll
log-game-started = Das Spiel hat begonnen.
game-over-heading = Spiel vorbei
game-over-won = Du hast gewonnen!
game-over-lost = Du hast verloren.
# `result` is won or lost, for the player reading it; `winner` and `loser` are names or "Du".
game-over-how = { $reason ->
        [health] { $result ->
            [won] { $loser } hat in Runde { $round } kein { $health } mehr.
           *[lost] { $loser } hast in Runde { $round } kein { $health } mehr.
        }
        [fangs] { $result ->
            [won] { $winner } hast in Runde { $round } genug { $fangs } gesammelt.
           *[lost] { $winner } hat in Runde { $round } genug { $fangs } gesammelt.
        }
        [crosses] { $result ->
            [won] { $winner } hast in Runde { $round } genug { $crosses } gesammelt.
           *[lost] { $winner } hat in Runde { $round } genug { $crosses } gesammelt.
        }
       *[resignation] { $result ->
            [won] { $loser } hat in Runde { $round } aufgegeben.
           *[lost] { $loser } hast in Runde { $round } aufgegeben.
        }
    }
game-over-markers = Deine Marker
game-over-view-replay = Wiederholung ansehen
rematch = Revanche
rematch-waiting = Du hast um eine Revanche gebeten. Warte auf dein Gegenüber.
rematch-opponent-ready = Dein Gegenüber möchte eine Revanche.
rematch-started = Revanche gestartet: Spiel { $number } in diesem Raum.
round-summary = Runde { $round } im Überblick
round-summary-set-aside = Beiseitegelegt: { CHARACTER($character) }
round-summary-badge = { $who ->
        [you] { $player } hast
       *[opponent] { $player } hat
    } in Runde { $next } das { $badge }.

## Markers and cards
count-health = Leben: { $n }
count-cross = Kreuze: { $n }
count-fang = Reißzähne: { $n }
count-hourglass = Sanduhren: { $n }
count-placed = Gesetzte Sanduhren: { $n }
count-hand = Karten auf der Hand: { $n }
holds-potion = Hat den Trank
holds-badge = Hat das Abzeichen
plan-status-none = Plan: noch nicht versiegelt
plan-status-hidden = Plan: versiegelt, mit { $count ->
        [one] 1 Zielkarte
       *[other] { $count } Zielkarten
    }
plan-status-revealed = Plan: { $plan }
card-character =
    { CHARACTER($character) }, Initiative { $initiative }, { $faction }
card-fool = Der Narr
count-badge = Abzeichen: { $n }
count-potion = Trank: { $n }
# Starts with the card's visible text in the order it is drawn: the initiative, then the name.
card-name =
    { $initiative }, { CHARACTER($character) }, { $faction }. { $ability }
card-fool-name = Der Narr. { $ability }

## Card abilities, in our own words; each marker named is an argument, so it can be drawn as a token
card-ability-hunter = Gib, wenn du willst, ein { $cross } aus, um bis zu 2 Werwölfe anzugreifen.
card-ability-wolf-king = Greife beliebig viele Menschen an. Jeder Mensch nach dem ersten kostet einen { $fang }, sonst gibt es keinen Angriff.
card-ability-knight = Erhalte eine { $hourglass }. Greife dann einen Werwolf an.
card-ability-wolfen = Erhalte eine { $hourglass }. Greife dann einen beliebigen Charakter an.
card-ability-seer = Greife einen Werwolf an. Ein Treffer kostet dein Gegenüber 2 Leben.
card-ability-witch = Erhalte den { $potion }. Kann nur auf den Narren zielen.
card-ability-wolf-beauty = Erhalte einen { $fang }. Greife dann einen beliebigen Charakter an.
card-ability-villager = Erhalte ein { $cross }. Kann nur auf den Narren zielen.
card-ability-fool = Keine Wirkung. Passt in jeden Plan, um zu bluffen.

## Card text, drawn on large and medium cards; its words also appear in the matching card-ability message
card-text-hunter = Gib ein { $cross } aus, um bis zu 2 Werwölfe anzugreifen.
card-text-wolf-king = Greife Menschen an. Jeder nach dem ersten kostet einen { $fang }.
card-text-knight = Erhalte eine { $hourglass }. Greife dann einen Werwolf an.
card-text-wolfen = Erhalte eine { $hourglass }. Greife dann einen Charakter an.
card-text-seer = Greife einen Werwolf an. Ein Treffer kostet 2 Leben.
card-text-witch = Erhalte den { $potion }. Kann nur auf den Narren zielen.
card-text-wolf-beauty = Erhalte einen { $fang }. Greife dann einen Charakter an.
card-text-villager = Erhalte ein { $cross }. Kann nur auf den Narren zielen.
card-text-fool = Keine Wirkung. Passt in jeden Plan, um zu bluffen.

## How to read abilities
legend-heading = So liest du die Fähigkeiten
legend-gain = Erhalten
legend-gain-text = Erhalte den gezeigten Marker.
legend-attack = Angriff
legend-attack-text = Greife für jede Form einen Charakter an.
legend-shape-werewolf = Werwolf
legend-shape-human = Mensch
legend-shape-any = Beliebiger Charakter
legend-damage = Mehr Schaden
legend-damage-text = Ein Treffer kostet 2 Leben statt 1.
legend-spend = Ausgeben
legend-spend-text = Gib den Marker vor dem Pfeil aus, um diesen Angriff auszuführen.

## Phases
phase-plan = Wähle einen Charakter und seine Ziele, dann versiegle deinen Plan.
phase-reveal-hourglass = Wähle, wie viele Sanduhren du auf deinen Charakter setzt.
phase-reveal-potion = Wähle eine Karte als Ziel für den Trank.
phase-hunter-choice = Dein Jäger ist am Zug: Gibst du ein Kreuz aus, um anzugreifen?
phase-round-over = Die Runde ist vorbei.
phase-final-showdown = Die Ergebnisse der letzten Runde stehen fest.
phase-waiting = Warte auf dein Gegenüber.
phase-none = Gerade gibt es nichts zu tun.
phase-step-plan = Plan
phase-step-reveal = Aufdecken
phase-step-potion = Trank
phase-step-showdown = Auflösung
phase-step-round-over = Rundenende

## Plan builder
plan-heading = Dein Plan
plan-targets-heading = Ziele
plan-summary = Plan: { $plan }
plan-summary-empty = Wähle einen Charakter
plan-seal = Plan versiegeln
plan-seal-incomplete = Der Plan ist noch nicht vollständig.
plan-character-not-offered = Dieser Charakter kann in dieser Runde nicht gespielt werden.
target-not-allowed = Der gewählte Charakter kann diese Karte nicht als Ziel wählen.
target-limit = Entferne zuerst ein Ziel: Mehr Ziele nimmt dieser Plan nicht.
plan-summary-short = { CHARACTER($character) } → { $targets }
plan-summary-short-none = { CHARACTER($character) } → keine Ziele
# The Fool as the summary lists its targets: bare names, without an article.
plan-summary-fool = Narr
plan-confirm-title = Diesen Plan versiegeln?
plan-confirm-cancel = Weiter wählen

## Reveal
reveal-heading = Aufdecken
reveal-hourglasses-heading = Sanduhren setzen
reveal-stepper = Zu setzende Sanduhren
reveal-hourglass-instruction = Wie viele Sanduhren setzt du?
reveal-fewer = Weniger Sanduhren
reveal-more = Mehr Sanduhren
reveal-initiative = { CHARACTER($character) }: Initiative { $effective } (aufgedruckt { $printed })
reveal-initiative-label = Initiative { CHARACTER($character, case: "gen", article: "def") }
reveal-initiative-change = { $printed } → { $effective }
reveal-order-note = Die niedrigere Initiative ist zuerst dran.
reveal-potion-heading = Ziel für den Trank wählen
reveal-potion-confirm = Erst eine Karte wählen

## Showdown
showdown-heading = Auflösung
showdown-next = Nächstes Ergebnis
showdown-empty = Die Ergebnisse erscheinen hier, während die Auflösung läuft.
showdown-hunter-heading = Dein Jäger
# `owner` is "Dein" for the player's own character and "Dein Gegenüber" for the opponent's.
showdown-out-yours = { $owner } Zug mit { CHARACTER($character, case: "dat", article: "def") } entfällt: { GENDER($character) ->
        [feminine] Sie
        [neuter] Es
       *[other] Er
    } ist ausgeschaltet.
showdown-out-opponent = { $owner } verliert den Zug mit { CHARACTER($character, case: "dat", article: "def") }: { GENDER($character) ->
        [feminine] Sie
        [neuter] Es
       *[other] Er
    } ist ausgeschaltet.
plan-panels-heading = Pläne

## Player sides in the reveal and showdown
side-you = Du
side-opponent = Dein Gegenüber
side-initiative = Initiative { $initiative }
side-initiative-changed = Initiative { $printed } → { $effective }
side-initiative-hidden = Initiative ?
side-target = → { $target }
side-more-targets = +{ $n }
side-pill = +{ $n }
side-pill-choosing = +?
side-placed = { $n ->
        [0] Keine Sanduhren
        [one] 1 Sanduhr
       *[other] { $n } Sanduhren
    } gesetzt
side-placed-choosing = Setzt noch Sanduhren
side-label = { $who }: { $plan }. Initiative { $initiative }.
side-label-changed = { $who }: { $plan }. Initiative { $effective } (aufgedruckt { $printed }).
side-label-hidden = { $who }: Charakter verdeckt, Initiative unbekannt.
side-label-ordered = { $label } { $position ->
        [1] Ist zuerst dran.
       *[other] Ist als Zweites dran.
    }

## Table layout
table-you = Du
drawer-summary = Spielprotokoll und Regeln
drawer-full-rules = Alle Regeln
rules-heading = Regeln
rules-order = Die niedrigere Initiative ist zuerst dran.
rules-tiebreak-hourglasses-then-badge = Bei Gleichstand ist zuerst dran, wer mehr Sanduhren gesetzt hat, dann, wer das Abzeichen hat.
rules-tiebreak-badge-only = Bei Gleichstand ist zuerst dran, wer das Abzeichen hat.
announcer-label = Ansagen
describe-button = Tisch beschreiben

## Rules hints
hint-plan = Dein Gegenüber sieht, wie viele Zielkarten du wählst, aber nicht welche.
hint-place-hourglasses = Jede Sanduhr, die du setzt, senkt die Initiative deines Charakters um 1.
hint-choose-potion-target = Hat dein Gegenüber die Karte gespielt, die du nennst, ist sie ausgeschaltet, bevor irgendetwas anderes passiert.
hint-hunter-choice = Ohne ein Kreuz auszugeben, greift dein Jäger nicht an.
hint-next-round = In der nächsten Runde geht das Abzeichen an den anderen Spieler.

## Table description
describe-round = Runde { $round }.
describe-hand = Deine Hand: { $cards }.
describe-hand-empty = Deine Hand ist leer.
describe-my-markers = Deine Marker: { $markers }.
describe-opponent-markers = Marker deines Gegenübers: { $markers }.
describe-opponent-hand = Dein Gegenüber hat { $n ->
        [one] 1 Karte
       *[other] { $n } Karten
    } auf der Hand.
describe-my-plan = Dein Plan: { $plan }.
describe-my-plan-none = Du hast noch keinen Plan versiegelt.
describe-my-plan-hidden = Du hast einen Plan mit { $count ->
        [one] 1 Zielkarte
       *[other] { $count } Zielkarten
    } versiegelt.
describe-opponent-plan = Plan deines Gegenübers: { $plan }.
describe-opponent-plan-none = Dein Gegenüber hat noch keinen Plan versiegelt.
describe-opponent-plan-hidden = Dein Gegenüber hat einen Plan mit { $count ->
        [one] 1 Zielkarte
       *[other] { $count } Zielkarten
    } versiegelt.
describe-potion-target = Ziel des Tranks: { CHARACTER($card, article: "def") }.
describe-order = { $first ->
        [you] { GENDER($firstCharacter) ->
            [feminine] Deine
           *[other] Dein
        } { CHARACTER($firstCharacter) } ist zuerst dran, dann { CHARACTER($secondCharacter, article: "def") } deines Gegenübers.
       *[opponent] Zuerst ist { CHARACTER($firstCharacter, article: "def") } deines Gegenübers dran, dann { GENDER($secondCharacter) ->
            [feminine] deine
           *[other] dein
        } { CHARACTER($secondCharacter) }.
    }
describe-turn-you = Du bist dran.
describe-turn-opponent = Dein Gegenüber ist dran.
describe-turn-both = Ihr seid beide dran.
describe-turn-none = Gerade ist niemand dran.
app-load-failed = Das Spiel konnte nicht geladen werden. Lade die Seite neu, um es noch einmal zu versuchen.

## Problems
problem-last = Letztes Problem: { $detail }
problem-rate-limited = Zu viele Aktionen in kurzer Zeit. Warte einen Moment und versuch es noch einmal.
problem-other = Der Host konnte mit der letzten Nachricht nichts anfangen.
problem-other-online = Der Spielserver konnte mit der letzten Nachricht nichts anfangen.
problem-not-connected = Du bist gerade nicht verbunden. Warte, bis die Verbindung wieder da ist, und versuch es noch einmal.
problem-command-not-sent = Diese Aktion ist nicht mehr möglich.

## Where to play
play-label = Spielen
play-online = Online
play-device = Dieses Gerät
play-create-hint-online = Spiel mit jemandem, egal wo, über einen Beitrittscode.
play-create-hint-device = Zwei Tabs dieses Browsers, um das Spiel auszuprobieren.
play-join-hint-online = Gib den Code ein, den du bekommen hast.
play-join-hint-device = Gib den Code aus dem anderen Tab ein.

## Online: creating a game
create-heading = Neues Spiel
create-grace-legend = Zeit zum Zurückkommen
create-grace-hint = So lange hat jemand, dessen Verbindung abbricht, Zeit zurückzukommen, bevor sein Gegenüber den Sieg beanspruchen kann.
create-grace-option = { $minutes } Min.
create-badge-legend = Abzeichen (wer beginnt)
create-badge-random = Zufall
create-badge-me = Ich beginne
create-badge-opponent = Gegenüber beginnt
create-advanced = Erweitert
create-tiebreak-legend = Gleichstand
create-tiebreak-hourglasses_then_badge = Sanduhren, dann Abzeichen
create-tiebreak-badge_only = Nur Abzeichen
create-min-targets-legend = Mindestzahl an Zielen
create-min-targets-hint = Wie viele Zielkarten ein Plan mindestens haben muss.
create-min-targets-option = { $count }
create-submit = Spiel erstellen
create-creating = Spiel wird erstellt
create-failed-rate-limited = Aus diesem Netzwerk wurden zuletzt zu viele Spiele erstellt. Versuch es später noch einmal.
create-failed-unavailable = Der Spielserver ist ausgelastet oder nicht erreichbar. Versuch es gleich noch einmal.
create-failed-server = Der Spielserver antwortet gerade nicht. Versuch es später noch einmal.
create-failed-network = Der Spielserver ist nicht erreichbar. Prüfe deine Verbindung und versuch es noch einmal.
create-failed-other = Das Spiel konnte nicht erstellt werden.

## Online: display name
name-title = Wie soll dein Gegenüber dich nennen?
name-label = Dein Name
name-hint = Für dein Gegenüber sichtbar. Du kannst ihn später in den Einstellungen ändern.
name-continue = Weiter
name-skip = Überspringen

## Online: joining a game
online-join-heading = Spiel beitreten
online-join-code-invalid = Gib den sechsstelligen Code ein, den dein Gegenüber geteilt hat.
online-server-other = Dieses Spiel nutzt einen anderen Server: { $host }
online-server-invalid = Die Serveradresse in diesem Link ist ungültig, daher wurde das Spiel nicht geöffnet.
online-join-new = Als neuer Spieler beitreten
online-rejoin-pin = Mit PIN zurückkehren
online-room-full-rejoin = Mit deiner PIN zurückkehren
online-join-other = Anderem Spiel beitreten

## Online: inviting
invite-title = Einladen
invite-heading = Lade dein Gegenüber ein
invite-code-label = Beitrittscode
invite-instructions-resumed = Teile den Code oder den Link mit deinem Gegenüber. Das Spiel ist pausiert: Es geht weiter, sobald dein Gegenüber beitritt und ihr beide „Fortsetzen“ wählt.
invite-link = Einladungslink: { $link }
invite-copy-code = Code kopieren
invite-share = Link teilen
invite-waiting = Warte auf dein Gegenüber …
invite-joined = Dein Gegenüber ist da; das Spiel startet …
invite-options = Spieloptionen
invite-option-badge-random = Abzeichen: Zufall
invite-option-badge-you = Abzeichen: du beginnst
invite-option-badge-opponent = Abzeichen: dein Gegenüber beginnt
invite-option-tiebreak = Gleichstand: { $rule }
invite-option-min-targets = { $count ->
        [one] Mindestens 1 Ziel
       *[other] Mindestens { $count } Ziele
    }
invite-share-text = Lass uns { -game-name } spielen: Tritt mit dem Code { $code } bei.
copy-done = Kopiert
copy-failed = Kopieren hat nicht geklappt. Markiere den Text und kopiere ihn selbst.

## Online: connection
connection-heading = Verbindung
connection-online = Verbunden
connection-connecting = Verbindung wird hergestellt
connection-offline = Verbindung verloren; neuer Versuch läuft
connection-hidden = Pausiert, solange diese Seite im Hintergrund ist
connection-stopped = Nicht verbunden
connection-server-unavailable = Der Spielserver antwortet nicht. Dein Spiel bleibt auf dem Server; dieser Link funktioniert später wieder.
opponent-reconnecting = Warte, bis dein Gegenüber wieder verbunden ist ({ $time })
opponent-reconnect-over = Dein Gegenüber ist nicht rechtzeitig zurückgekommen.
opponent-still-waiting = Du wartest weiter, bis dein Gegenüber wieder verbunden ist.
claim-win = Sieg beanspruchen
claim-keep-waiting = Weiter warten
claim-confirm = Sieg beanspruchen? Das Spiel endet, als hätte dein Gegenüber aufgegeben.
stop-protocol-version = Diese Seite ist veraltet. Lade sie neu und versuch es noch einmal.
stop-room-full = Dieses Spiel hat schon zwei Spieler.
stop-unknown-room = Es gibt kein Spiel mit diesem Code; vielleicht ist es abgelaufen. Prüfe den Code und versuch es noch einmal.
stop-unknown-seat = Der Platz dieses Geräts in diesem Spiel ist nicht mehr bekannt.
stop-superseded = Das Spiel geht auf einem anderen Gerät weiter.
stop-rejoin-declined = Dein Gegenüber hat dieses Gerät nicht hereingelassen.
stop-rejoin-unavailable = Dieser Platz lässt sich gerade nicht so übernehmen. Ist er noch auf einem anderen Gerät verbunden, nimm die PIN.

## Online: continuing on another device
continue-heading = Auf anderem Gerät weiterspielen
continue-instructions = Öffne auf dem anderen Gerät den Rückkehr-Link, oder wähle „Spiel beitreten“ und gib den Code ein, dann „Mit deiner PIN zurückkehren“.
continue-code = Beitrittscode: { $code }
continue-seat = Dein Platz: { $seat }
continue-link = Rückkehr-Link: { $link }
continue-copy-link = Rückkehr-Link kopieren
continue-show-pin = PIN zeigen
continue-hide-pin = PIN verbergen
continue-pin = PIN: { $pin }
continue-pin-hint = Behalte die PIN für dich: Wer sie hat, kann deinen Platz übernehmen.
continue-qr-hint = Oder scanne diesen Code mit dem anderen Gerät. Er enthält den Rückkehr-Link, nicht die PIN.

## Online: requests to take a seat
rejoin-request-title = Dieses Gerät als dein Gegenüber spielen lassen?
rejoin-request-detail = Jemand ohne PIN möchte den Platz deines Gegenübers übernehmen. Erlaube das nur, wenn dein Gegenüber dich darum gebeten hat.
rejoin-allow = Erlauben
rejoin-deny = Nicht erlauben
pin-attempt-failed = Jemand hat eine falsche PIN für den Platz deines Gegenübers eingegeben.

## Game menu
menu-summary = Spielmenü
sheet-close = Schließen
menu-pause = Nach dieser Runde pausieren

## Pausing
pause-heading = Pause
pause-requested-you = Du möchtest nach dieser Runde pausieren. Warte, bis dein Gegenüber zustimmt.
pause-requested-opponent = Dein Gegenüber möchte nach dieser Runde pausieren.
pause-accept = Der Pause zustimmen
pause-decline = Weiterspielen
pause-cancel = Pause abbrechen
pause-agreed = Pause vereinbart: gilt ab Rundenende
paused-heading = Spiel pausiert
paused-detail = Das Spiel bleibt auf dem Server, und dieses Gerät hat einen Spielstand davon. Prüfe unten Runde und Marker, bevor du fortsetzt.
resume = Fortsetzen
resume-waiting = Du bist bereit fortzusetzen. Warte auf dein Gegenüber.
resume-opponent-ready = Dein Gegenüber ist bereit fortzusetzen.

## Saves
save-room-gone = Der Raum dieses Spiels ist geschlossen, aber dieses Gerät hat einen Spielstand davon behalten.
save-resume = Vom Spielstand fortsetzen
save-resuming = Raum wird aus dem Spielstand erstellt
save-failed-invalid = Der Spielserver hat den Spielstand nicht angenommen.

## Resigning
resign = Aufgeben
resign-confirm = Dieses Spiel aufgeben? Dein Gegenüber gewinnt.
resign-cancel = Weiterspielen

## Online: rejoining
rejoin-heading = Zu einem Spiel zurückkehren
rejoin-seat-legend = Welcher Spieler warst du?
rejoin-seat-missing = Wähle, welcher Spieler du warst.
rejoin-pin-label = PIN
rejoin-pin-hint = Vier Ziffern, zu sehen unter „Auf anderem Gerät weiterspielen“ auf dem Gerät, auf dem du gespielt hast.
rejoin-pin-invalid = Gib die vierstellige PIN ein oder wähle „Ich kenne meine PIN nicht“.
rejoin-submit = Zurückkehren
rejoin-ask = Ich kenne meine PIN nicht
rejoin-ask-hint = Dein Gegenüber wird gefragt, ob es dieses Gerät hereinlässt.
rejoin-waiting-approval = Warte, bis dein Gegenüber dieses Gerät hereinlässt.
rejoin-joined = Zurück im Spiel; es wird geöffnet.

## Online: shared
countdown = { $minutes }:{ NUMBER($seconds, minimumIntegerDigits: 2) }
server-confirm = Mit { $host } verbinden? Mach nur weiter, wenn du diesem Server vertraust.
server-continue = Weiter
server-cancel = Abbrechen
opponent-disconnected = Dein Gegenüber hat die Verbindung verloren.
opponent-reconnected = Dein Gegenüber ist wieder verbunden.
rejoin-request-expires = Läuft ab in { $time }

## History
history-heading = Verlauf
history-stats-link = Statistik
history-empty = Noch keine beendeten Spiele. Online-Spiele, die du beendest, landen hier – nur auf diesem Gerät.
history-won = Gewonnen
history-lost = Verloren
history-summary = { $result } gegen { $opponent }
# A row of the history list: `result` (Won or Lost) is drawn in bold.
history-row-title = { $result } gegen { $opponent }
history-meta = { $date }, { $rounds ->
        [one] 1 Runde
       *[other] { $rounds } Runden
    }, { $reason }
history-row-meta = { $date } · { $rounds ->
        [one] 1 Runde
       *[other] { $rounds } Runden
    } · { $reason }
history-played = Gespielt
history-won-by = Gewonnen durch { $reason }
history-replay = Wiederholung
history-replay-label = Wiederholung: { $summary }, { $meta }
reason-health = Leben
reason-fangs = Reißzähne
reason-crosses = Kreuze
reason-resignation = Aufgabe

## Replay
replay-heading = Wiederholung
replay-menu = Menü der Wiederholung
replay-missing = Dieses Spiel ist nicht auf diesem Gerät.
replay-unplayable = Dieses Spiel wurde nach älteren Regeln gespielt und lässt sich nicht als Wiederholung abspielen.
replay-position = Schritt { $step } von { $total }, Runde { $round }
replay-controls = Steuerung der Wiederholung
replay-previous-step = Vorheriger Schritt
replay-next-step = Nächster Schritt
replay-previous-round = Vorherige Runde
replay-next-round = Nächste Runde
replay-keys-hint = Mit den Pfeiltasten links und rechts gehst du zurück und vor.
replay-view-group = Sicht
replay-view-mine = Meine Sicht
replay-view-full = Alles
# `who` is a name or "Du", so the choice follows a colon rather than a verb.
replay-command = { $who }: { $command }
replay-hands-heading = Hände
replay-hand-of = Hand von { $name }
replay-hand-hidden = { $n ->
        [one] 1 Karte, verdeckt
       *[other] { $n } Karten, verdeckt
    }
replay-hand-empty = Keine Karten
replay-log-heading = Ereignisse in diesem Schritt
replay-log-empty = In diesem Schritt ist nichts passiert.
replay-log-above = Was passiert ist, siehst du oben.

## Stats
stats-heading = Statistik
stats-overall-caption = Gesamt
stats-empty = Noch keine beendeten Spiele, also auch keine Statistik.
stats-games = Gespielte Spiele: { $n }
stats-record = { $won } gewonnen, { $lost } verloren
stats-average-rounds = Runden pro Spiel im Schnitt: { $n }
stats-conditions-caption = Ergebnisse nach Siegbedingung
stats-picks-caption = Gewählte Charaktere
stats-picks-note = Nur deine eigene Wahl. Eine Wahl ist erfolgreich, wenn ihr Charakter danach einen Marker erhalten oder mit einem Angriff getroffen hat.
stats-opponents-caption = Ergebnisse nach Gegenüber
stats-col-condition = Siegbedingung
stats-col-character = Charakter
stats-col-opponent = Gegenüber
stats-col-won = Gewonnen
stats-col-lost = Verloren
stats-col-picked = Gewählt
stats-col-succeeded = Erfolge
stats-col-rate = Quote
stats-rate = { $percent } %
stats-rate-none = Nicht gewählt
