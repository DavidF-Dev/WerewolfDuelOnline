# Test-only messages that format a character in each form, loaded over a locale's messages.

probe-default = [{ CHARACTER($c) }]
probe-def-nom = [{ CHARACTER($c, case: "nom", article: "def") }]
probe-def-acc = [{ CHARACTER($c, case: "acc", article: "def") }]
probe-def-dat = [{ CHARACTER($c, case: "dat", article: "def") }]
probe-def-gen = [{ CHARACTER($c, case: "gen", article: "def") }]
probe-indef-nom = [{ CHARACTER($c, case: "nom", article: "indef") }]
probe-indef-acc = [{ CHARACTER($c, case: "acc", article: "indef") }]
probe-indef-dat = [{ CHARACTER($c, case: "dat", article: "indef") }]
probe-indef-gen = [{ CHARACTER($c, case: "gen", article: "indef") }]
probe-none-nom = [{ CHARACTER($c, case: "nom", article: "none") }]
probe-none-acc = [{ CHARACTER($c, case: "acc", article: "none") }]
probe-none-dat = [{ CHARACTER($c, case: "dat", article: "none") }]
probe-none-gen = [{ CHARACTER($c, case: "gen", article: "none") }]
probe-bad-case = [{ CHARACTER($c, case: "abl") }]
probe-gender = [{ GENDER($c) ->
        [masculine] er
        [feminine] sie
       *[other] es
    }]
