# A test-only locale with German-style character forms, loaded over the English messages.
# It is not a translation; it exercises cases, articles and list attributes.

character-hunter = Jäger
    .gender = masculine
    .gen = Jägers
character-witch = Hexe
    .gender = feminine

grammar-character-form = { $article ->
        [def] { $case ->
            [acc] { $gender ->
                [masculine] den
               *[other] die
            }
            [dat] { $gender ->
                [masculine] dem
               *[other] der
            }
            [gen] { $gender ->
                [masculine] des
               *[other] der
            }
           *[nom] { $gender ->
                [masculine] der
               *[other] die
            }
        } { $name }
        [indef] { $case ->
            [acc] { $gender ->
                [masculine] einen
               *[other] eine
            }
            [dat] { $gender ->
                [masculine] einem
               *[other] einer
            }
            [gen] { $gender ->
                [masculine] eines
               *[other] einer
            }
           *[nom] { $gender ->
                [masculine] ein
               *[other] eine
            }
        } { $name }
       *[none] { $name }
    }

target-character = { $character }
target-fool = { $case ->
        [acc] den Narren
       *[other] der Narr
    }
plan-targeting = { CHARACTER($character, case: "acc", article: "def") } gegen { $targets }
    .list-case = acc
    .list-article = def

event-hand-dealt = { $actorName } bekommt { $cards }.
    .list-case = acc
    .list-article = def
event-character-resolved = Es wirkt { CHARACTER($character, case: "gen", article: "def") }.
cli-your-hand = Deine Hand: { $cards }
    .list-case = dat
    .list-article = indef
