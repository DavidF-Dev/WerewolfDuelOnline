# Werewolf: Duel! engine text (German). The player is "du"; the opponent is "dein Gegenüber".

## Seats
seat-p0 = Spieler 1
seat-p1 = Spieler 2

## Characters and factions
# A message names a character with CHARACTER($id), or CHARACTER($id, case: "acc", article: "def"):
# the case (nom, acc, dat or gen) and the article (def, indef or none) are optional and default to
# nom and none. The name in a case is the character's attribute of that name, or its value.
# GENDER($id) gives the character's `.gender` attribute (masculine, feminine or neuter), or none
# when it has none, for a message to select on.
character-hunter = Jäger
    .gender = masculine
    .nom = Jäger
    .acc = Jäger
    .dat = Jäger
    .gen = Jägers
character-wolf-king = Werwolfkönig
    .gender = masculine
    .nom = Werwolfkönig
    .acc = Werwolfkönig
    .dat = Werwolfkönig
    .gen = Werwolfkönigs
character-knight = Ritter
    .gender = masculine
    .nom = Ritter
    .acc = Ritter
    .dat = Ritter
    .gen = Ritters
character-wolfen = Jungwolf
    .gender = masculine
    .nom = Jungwolf
    .acc = Jungwolf
    .dat = Jungwolf
    .gen = Jungwolfs
character-seer = Seherin
    .gender = feminine
    .nom = Seherin
    .acc = Seherin
    .dat = Seherin
    .gen = Seherin
character-witch = Hexe
    .gender = feminine
    .nom = Hexe
    .acc = Hexe
    .dat = Hexe
    .gen = Hexe
character-wolf-beauty = Wolfsschönheit
    .gender = feminine
    .nom = Wolfsschönheit
    .acc = Wolfsschönheit
    .dat = Wolfsschönheit
    .gen = Wolfsschönheit
character-villager = Dorfbewohner
    .gender = masculine
    .nom = Dorfbewohner
    .acc = Dorfbewohner
    .dat = Dorfbewohner
    .gen = Dorfbewohners
# A character's name with its article: `name` is the name in `case`, and `gender` is the
# character's `.gender` attribute, or none, which takes the masculine article.
grammar-character-form = { $article ->
        [def] { $case ->
            [acc] { $gender ->
                [feminine] die
                [neuter] das
               *[other] den
            }
            [dat] { $gender ->
                [feminine] der
               *[other] dem
            }
            [gen] { $gender ->
                [feminine] der
               *[other] des
            }
           *[nom] { $gender ->
                [feminine] die
                [neuter] das
               *[other] der
            }
        } { $name }
        [indef] { $case ->
            [acc] { $gender ->
                [feminine] eine
                [neuter] ein
               *[other] einen
            }
            [dat] { $gender ->
                [feminine] einer
               *[other] einem
            }
            [gen] { $gender ->
                [feminine] einer
               *[other] eines
            }
           *[nom] { $gender ->
                [feminine] eine
               *[other] ein
            }
        } { $name }
       *[none] { $name }
    }

faction-human = Mensch
faction-werewolf = Werwolf

# A plan's target. `character` is the name already in the form the plan's list gives; `case`
# and `article` give that form for the Fool.
target-fool = { $article ->
        [def] { $case ->
            [acc] den Narren
            [dat] dem Narren
            [gen] des Narren
           *[nom] der Narr
        }
        [indef] { $case ->
            [acc] einen Narren
            [dat] einem Narren
            [gen] eines Narren
           *[nom] ein Narr
        }
       *[none] { $case ->
            [nom] Narr
           *[other] Narren
        }
    }
target-character = { $character }

## Markers
marker-cross = Kreuz
marker-fang = Reißzahn
marker-hourglass = Sanduhr
marker-potion = Trank
marker-health = Leben
marker-badge = Abzeichen
# A marker's name for an uncounted number of them.
marker-crosses = Kreuze
marker-fangs = Reißzähne
# A marker's name after a count of them.
marker-cross-count = { $n ->
        [one] Kreuz
       *[other] Kreuze
    }
marker-fang-count = { $n ->
        [one] Reißzahn
       *[other] Reißzähne
    }
marker-hourglass-count = { $n ->
        [one] Sanduhr
       *[other] Sanduhren
    }

## Why an attack was not made
# `cross` and `fangs` hold the marker names.
forfeit-no-cross = Es gibt kein { $cross } zum Ausgeben
forfeit-declined = Das { $cross } wurde nicht ausgegeben
forfeit-cannot-pay-fangs = Für die weiteren Ziele fehlen { $fangs }
forfeit-no-targets = Unter den Zielen ist kein Charakter

## Why the game ended
win-reason-health = weil das Leben des Gegenübers auf null gesunken ist
win-reason-fangs = weil genug Reißzähne gesammelt wurden
win-reason-crosses = weil genug Kreuze gesammelt wurden
win-reason-resignation = weil das Gegenüber aufgegeben hat

## Plans
# A message that takes a list of characters may give the form of every item in it with
# `.list-case` and `.list-article`, as CHARACTER takes them.
# The plan's character has no article, so a plan reads the same as a subject and as an object.
plan-targeting = { CHARACTER($character) } gegen { $targets }
    .list-case = acc
    .list-article = def
plan-no-targets = { CHARACTER($character) } ohne Ziel

## Words for a player, seen from one seat
player-you-cap = Du
player-you = du
player-your-cap = Dein
player-your = dein
player-opponent-cap = Dein Gegenüber
player-opponent = dein Gegenüber
# Further words for languages whose words for a player change with their case, or with the
# gender of what they own; English does not use them.
player-you-dat = dir
player-your-acc-masculine = deinen
player-your-acc-feminine = deine
player-opponent-dat = deinem Gegenüber
player-opponent-gen = deines Gegenübers

## Events
# Character arguments are character ids, for CHARACTER; `cards` is a list of characters.
# Seat arguments are raw selector values: you, opponent, p0 or p1. The matching
# `...Name` argument holds the display name used for p0 and p1. `badge`, `potion`,
# `health`, `hourglasses` and `marker` hold the name of a marker, counted where needed.
# `youCap`, `you`, `yourCap`, `your`, `opponentCap` and `opponent` hold the words that stand
# for a player in the you and opponent variants, so that they can be emphasised; `youDat`,
# `yourAccMasculine`, `yourAccFeminine`, `opponentDat` and `opponentGen` hold the further words.
# An owner named after a character ("den Jäger deines Gegenübers") follows the name directly.
event-game-started = Das Spiel beginnt. Prüfwert des Startwerts: { $commitment }.
event-round-started = Runde { $round } beginnt. { $actor ->
        [you] { $youCap } hast
        [opponent] { $opponentCap } hat
       *[other] { $actorName } hat
    } das { $badge }.
event-hand-dealt = { $actor ->
        [you] { $youCap } bekommst
        [opponent] { $opponentCap } bekommt
       *[other] { $actorName } bekommt
    } { $cards }.
    .list-case = acc
    .list-article = def
event-plan-submitted = { $actor ->
        [you] { $youCap } versiegelst
        [opponent] { $opponentCap } versiegelt
       *[other] { $actorName } versiegelt
    } einen Plan mit { $count ->
        [one] 1 Zielkarte
       *[other] { $count } Zielkarten
    }.
event-hourglasses-placed = { $actor ->
        [you] { $youCap } setzt
        [opponent] { $opponentCap } setzt
       *[other] { $actorName } setzt
    } { $n ->
        [0] keine
       *[other] { $n }
    } { $hourglasses }.
event-potion-target-chosen = { $actor ->
        [you] { $youCap } zielst
        [opponent] { $opponentCap } zielt
       *[other] { $actorName } zielt
    } mit dem { $potion } auf { CHARACTER($card, case: "acc", article: "def") }.
event-plans-revealed = Die Pläne sind aufgedeckt. { $actor ->
        [you] { $youCap }
       *[other] { $actorName }
    }: { $actorPlan }, Initiative { $actorInitiative }. { $other ->
        [opponent] { $opponentCap }
       *[other] { $otherName }
    }: { $otherPlan }, Initiative { $otherInitiative }. { $first ->
        [you] { $youCap } bist
        [opponent] { $opponentCap } ist
       *[other] { $firstName } ist
    } zuerst dran.
event-potion-resolved = { $result ->
        [hit] Der { $potion } trifft { $victim ->
            [you] { GENDER($card) ->
                [feminine] { $yourAccFeminine }
                [neuter] { $your }
               *[other] { $yourAccMasculine }
            } { CHARACTER($card, case: "acc") }
            [opponent] { CHARACTER($card, case: "acc", article: "def") } { $opponentGen }
           *[other] { CHARACTER($card, case: "acc", article: "def") } von { $victimName }
        }! { $victim ->
            [you] { $youCap } verlierst
            [opponent] { $opponentCap } verliert
           *[other] { $victimName } verliert
        } { $lost } { $health }.
       *[miss] Der { $potion } geht daneben: { $victim ->
            [you] { $youCap } hast
            [opponent] { $opponentCap } hat
           *[other] { $victimName } hat
        } { CHARACTER($card, case: "acc", article: "def") } nicht gespielt.
    }
event-character-resolved = { $actor ->
        [you] { $youCap } bist
        [opponent] { $opponentCap } ist
       *[other] { $actorName } ist
    } mit { CHARACTER($character, case: "dat", article: "def") } am Zug.
event-marker-gained = { $source ->
        [opponent] { $actor ->
            [you] { $youCap } nimmst
            [opponent] { $opponentCap } nimmt
           *[other] { $actorName } nimmt
        } 1 { $marker } von { $other ->
            [you] { $youDat }
            [opponent] { $opponentDat }
           *[other] { $otherName }
        }.
       *[supply] { $actor ->
            [you] { $youCap } erhältst
            [opponent] { $opponentCap } erhält
           *[other] { $actorName } erhält
        } { $markerId ->
            [potion] den { $marker }
           *[other] 1 { $marker }
        }.
    }
event-marker-spent = { $actor ->
        [you] { $youCap } gibst
        [opponent] { $opponentCap } gibt
       *[other] { $actorName } gibt
    } { $n } { $marker } aus.
event-attack-hit = { $actor ->
        [you] { $youCap } triffst
        [opponent] { $opponentCap } trifft
       *[other] { $actorName } trifft
    } mit { CHARACTER($attacker, case: "dat", article: "def") } { $targetSeat ->
        [you] { GENDER($character) ->
            [feminine] { $yourAccFeminine }
            [neuter] { $your }
           *[other] { $yourAccMasculine }
        } { CHARACTER($character, case: "acc") }
        [opponent] { CHARACTER($character, case: "acc", article: "def") } { $opponentGen }
       *[other] { CHARACTER($character, case: "acc", article: "def") } von { $targetSeatName }
    }! { $targetSeat ->
        [you] { $youCap } verlierst
        [opponent] { $opponentCap } verliert
       *[other] { $targetSeatName } verliert
    } { $lost } { $health }.
event-attack-missed = { $actor ->
        [you] { $yourCap } Angriff
        [opponent] Der Angriff { $opponentGen }
       *[other] Der Angriff von { $actorName }
    } mit { CHARACTER($attacker, case: "dat", article: "def") } geht daneben.
event-attack-forfeited = { $actor ->
        [you] { $youCap } greifst
        [opponent] { $opponentCap } greift
       *[other] { $actorName } greift
    } nicht an: { $reason }.
event-round-ended = Runde { $round } endet. { $actor ->
        [you] { $youCap } bekommst
        [opponent] { $opponentCap } bekommt
       *[other] { $actorName } bekommt
    } das { $badge }.
event-discard-revealed = Die in Runde { $round } beiseitegelegte Karte war { CHARACTER($character, article: "def") }.
event-next-round-requested = { $actor ->
        [you] { $youCap } bist
        [opponent] { $opponentCap } ist
       *[other] { $actorName } ist
    } bereit für die nächste Runde.
event-resigned = { $actor ->
        [you] { $youCap } gibst auf.
        [opponent] { $opponentCap } gibt auf.
       *[other] { $actorName } gibt auf.
    }
event-segment-started = Das Spiel geht in Runde { $round } weiter.
event-game-over = { $reason ->
        [health] { $actor ->
            [you] { $youCap } gewinnst
            [opponent] { $opponentCap } gewinnt
           *[other] { $actorName } gewinnt
        }, weil { $other ->
            [you] { $you } kein { $health } mehr hast
            [opponent] { $opponent } kein { $health } mehr hat
           *[other] { $otherName } kein { $health } mehr hat
        }.
        [fangs] { $actor ->
            [you] { $youCap } hast
            [opponent] { $opponentCap } hat
           *[other] { $actorName } hat
        } genug { $fangs } gesammelt und { $actor ->
            [you] gewinnst
           *[other] gewinnt
        }.
        [resignation] { $actor ->
            [you] { $youCap } gewinnst
            [opponent] { $opponentCap } gewinnt
           *[other] { $actorName } gewinnt
        }, weil { $other ->
            [you] { $you } aufgegeben hast
            [opponent] { $opponent } aufgegeben hat
           *[other] { $otherName } aufgegeben hat
        }.
       *[crosses] { $actor ->
            [you] { $youCap } hast
            [opponent] { $opponentCap } hat
           *[other] { $actorName } hat
        } genug { $crosses } gesammelt und { $actor ->
            [you] gewinnst
           *[other] gewinnt
        }.
    }

## Commands, as offered to a player
command-submit-plan = { $plan } spielen
command-place-hourglasses = { $n ->
        [0] Keine Sanduhren
        [one] 1 Sanduhr
       *[other] { $n } Sanduhren
    } setzen
command-choose-potion-target = Mit dem Trank auf { CHARACTER($card, case: "acc", article: "def") } zielen
command-hunter-spend-cross-yes = Ein Kreuz ausgeben und angreifen
command-hunter-spend-cross-no = Das Kreuz behalten
command-next-round = Nächste Runde

## Input errors
error-invalid-input = Diese Eingabe ist ungültig.
error-engine-not-ready = Die Spiel-Engine ist noch nicht fertig geladen.
error-game-disposed = Dieses Spiel wurde bereits geschlossen.

## Rule errors
error-game-over = Das Spiel ist vorbei.
error-not-your-turn = Du bist nicht dran.
error-wrong-phase = Das ist in dieser Phase nicht erlaubt.
error-character-not-in-hand = Dieser Charakter ist nicht auf deiner Hand.
error-target-not-allowed = Dieser Charakter kann diese Karte nicht als Ziel wählen.
error-target-in-hand = Du kannst keine Karte auf deiner eigenen Hand als Ziel wählen.
error-too-many-targets = Dieser Plan hat zu viele Ziele.
error-too-few-targets = Dieser Plan braucht mehr Ziele.
error-not-enough-hourglasses = So viele Sanduhren hast du nicht.
error-potion-target-in-hand = Eine Karte, die in dieser Runde auf deiner Hand war, kann nicht das Ziel des Tranks sein.

## Edit errors
error-edit-wrong-phase = Die Hände lassen sich nur bearbeiten, bevor ein Plan versiegelt ist.
error-edit-supply-exceeded = Dafür bräuchte es mehr Marker, als es gibt.
error-edit-invalid-hands = Die Hände müssen jeden Charakter genau einmal enthalten und die richtige Größe haben.
error-edit-would-end-game = Eine Bearbeitung darf das Spiel nicht beenden: Das Leben muss über 0 bleiben, die Kreuze unter 4 und die Reißzähne unter 3.

## Replay errors
error-replay-format-version = Version { $version } des Aufzeichnungsformats wird nicht unterstützt.
error-replay-engine-version = Die Aufzeichnung stammt von Engine-Version { $version }.
error-replay-no-segments = Die Aufzeichnung hat keine Abschnitte.
error-replay-rule = Eintrag { $index } wurde von den Regeln abgelehnt: { $detail }
error-replay-edit = Eintrag { $index } wurde als Bearbeitung abgelehnt: { $detail }
error-replay-checkpoint-mismatch = Der Zustands-Hash weicht bei Eintrag { $index } von Abschnitt { $segment } vom Prüfpunkt ab.
error-replay-commitment-mismatch = Der Startwert von Abschnitt { $segment } passt nicht zu seinem Prüfwert.
error-replay-edits-unsupported = Die Aufzeichnung enthält Bearbeitungen, die diese Version nicht anwenden kann.
error-replay-invalid-boundary = Ein Abschnitt beginnt an einer unmöglichen Rundengrenze.
error-replay-segment-discontinuity = Abschnitt { $segment } schließt nicht an den vorherigen an.
error-replay-taint-mismatch = Die Aufzeichnung enthält Bearbeitungen, ist aber nicht als verändert markiert.

## Command-line messages
error-unsafe-required = Dieser Befehl umgeht die Regeln. Gib zur Bestätigung --unsafe an.
error-edit-expected-set = „set“ erwartet, aber „{ $detail }“ gefunden.
error-edit-unknown-field = Unbekanntes Feld „{ $detail }“.
error-edit-missing-value = Für „{ $detail }“ fehlt ein Wert.
error-edit-bad-value = Ungültiger Wert „{ $detail }“.
error-edit-bad-hands = Ungültige Hände: { $detail }.
error-read-failed = „{ $detail }“ kann nicht gelesen werden.
error-write-failed = „{ $detail }“ kann nicht geschrieben werden.
error-parse-failed = „{ $detail }“ kann nicht verarbeitet werden.
error-script-line = Zeile { $line } des Skripts ist ungültig: { $detail }.
error-fuzz-failed = Das Fuzzing hat ein Problem gefunden: { $detail }.

cli-pass-to-player = Gib an Spieler { $n } weiter und drück Enter
cli-seed = Startwert: { $seed }
cli-resign = Aufgeben
cli-choose = Wähle eine Aktion (Nummer oder q zum Beenden):
cli-choose-character = Wähle einen Charakter (Nummer oder q zum Beenden):
cli-invalid-choice = Das ist keine gültige Wahl.
cli-your-view = Runde { $round }. Abzeichen: { $badge }.
cli-your-hand = Deine Hand: { $cards }
# How the command-line tool joins a list. `cli-list-two` joins a list of two; a longer list is
# `cli-list-start` of its first item and the rest, each later item but the last two is
# `cli-list-middle` of that item and the rest, and the last two are joined by `cli-list-end`.
cli-list-two = { $first } und { $second }
cli-list-start = { $first }, { $second }
cli-list-middle = { $first }, { $second }
cli-list-end = { $first } und { $second }
cli-your-markers = Leben { $health }, Kreuze { $cross }, Reißzähne { $fang }, Sanduhren { $hourglass }, gesetzt { $placed }{ $potion ->
        [yes] , mit dem Trank
       *[no] { "" }
    }.
cli-opponent-markers = Gegenüber: Leben { $health }, Kreuze { $cross }, Reißzähne { $fang }, Sanduhren { $hourglass }, gesetzt { $placed }{ $potion ->
        [yes] , mit dem Trank
       *[no] { "" }
    }.
cli-game-over = Spielende. { $winner } gewinnt, { $reason }.
cli-saved = Aufzeichnung gespeichert unter { $path }.
cli-verify-ok = OK { $hash }
cli-verify-tainted = Hinweis: Diese Aufzeichnung ist verändert. Der Spielstand wurde außerhalb der Regeln bearbeitet, es ist also kein faires Spiel.
cli-step-header = Schritt { $step }: { $seat }
cli-step-command = Schritt { $step }: { $seat } – { $command }
cli-step-edit = Schritt { $step }: Spielstand bearbeitet
cli-step-start = Beginn von Abschnitt { $segment }
cli-step-continue = Drück Enter für den nächsten Schritt
cli-edit-applied = { $count ->
        [one] 1 Bearbeitung
       *[other] { $count } Bearbeitungen
    } angewendet. Der Spielstand ist jetzt verändert.
cli-state-written = Spielstand gespeichert unter { $path }.
cli-fuzz-summary = { $games } Spiele über { $rounds } Runden gespielt. Spieler 1 hat { $wins0 } gewonnen, Spieler 2 { $wins1 }.
# `reason` is health, fangs, crosses or resignation.
cli-fuzz-reason = { $reason ->
        [health] Siege, weil das Gegenüber kein Leben mehr hatte
        [fangs] Siege durch Reißzähne
        [crosses] Siege durch Kreuze
       *[resignation] Siege durch Aufgabe
    }: { $games }
