# A test-only locale whose article message cannot be formatted, as after a typo in a variable.

character-hunter = Jäger
    .gender = masculine

grammar-character-form = { $gendr ->
        [masculine] der
       *[other] die
    } { $name }

event-hand-dealt = { $actorName } bekommt { $cards }.
    .list-case = acc
    .list-article = def
cli-your-hand = Deine Hand: { $cards }
    .list-case = dat
    .list-article = indef
