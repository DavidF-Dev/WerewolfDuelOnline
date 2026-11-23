# Rules coverage

Each rule in the design specification (§5.1 to §5.5), plus each card text and FAQ answer from the research notes, mapped to the tests that prove it. Rules are paraphrased. Tests are given as `file::test_name`, and the files are under `crates/wwd-core/tests`.

| # | Source | Rule (paraphrased) | Test(s) |
|---|---|---|---|
| 1 | §5.1 Characters | The eight characters have initiatives 1 to 8 in card order | `targeting::initiatives_and_factions` |
| 2 | §5.1 Characters | Wolf King, Wolfen and Wolf Beauty are werewolves; the rest are human | `targeting::initiatives_and_factions` |
| 3 | §5.1 Target cards | Each player has nine target cards: one per character plus the Fool | `targeting::each_player_has_nine_target_cards`, `targeting::ids_and_ordering`, `targeting::knight_accepts_werewolf_and_fool` |
| 4 | §5.1 Markers | Supply holds 7 Crosses, 5 Fangs, 5 Hourglasses and 1 Potion; no marker is created or lost | `setup::marker_totals_conserved`, `fuzz::fuzz_1000_games` |
| 5 | §5.1 Markers | Each player has 2 Health, and Health is never regained | `setup::setup_markers`, `fuzz::fuzz_1000_games`, `fuzz::any_seed_game_is_valid` (the fuzzer fails any action that raises a Health) |
| 6 | §5.1 Badge | There is exactly one Badge | `setup::setup_markers` |
| 7 | §5.2 Setup 1 | Each player starts with 2 Health and 1 Cross, and the supply keeps the other 5 Crosses | `setup::setup_markers` |
| 8 | §5.2 Setup 2 | The Badge starts with a random player or a chosen one | `setup::badge_start_random_and_chosen` |
| 9 | §5.2 Setup 3 | The player without the Badge starts with 1 Hourglass | `setup::setup_markers`, `setup::badge_start_random_and_chosen` |
| 10 | §5.3 Round start 1 | Characters are shuffled with the seeded RNG | `determinism::shuffle_is_permutation_and_golden`, `setup::deal_is_seed_deterministic` |
| 11 | §5.3 Round start 2 | One character is discarded face-down and hidden from both players | `setup::round_one_deal_sizes`, `end_view_legal::view_redaction` |
| 12 | §5.3 Round start 3 | The Badge holder is dealt 4 characters and the other player 3 | `setup::round_one_deal_sizes`, `end_view_legal::round_end_returns_placed_and_passes_badge` |
| 13 | §5.3 Round start 3 | Hands are private | `end_view_legal::view_redaction`, `end_view_legal::visibility_filter` |
| 14 | §5.3 Plan | Plans are simultaneous and sealed until both are in | `plan_reveal::both_plans_clear_hands_and_open_hourglass_reveal`, `end_view_legal::view_redaction` |
| 15 | §5.3 Plan | A plan is one character from the hand plus at least one target card | `plan_reveal::plan_rejects_card_not_in_hand`, `plan_reveal::plan_is_validated_against_targeting_rules`, `plan_reveal::plan_rejects_second_submission` |
| 16 | §5.3 Plan | With `min_targets` set to 0, an empty plan is allowed | `targeting::villager_and_witch_fool_only`, `end_view_legal::legal_actions_min_targets_zero_allow_no_targets` |
| 17 | §5.3 Plan, targets | Hunter: up to 2 werewolf targets | `targeting::hunter_two_werewolves` |
| 18 | §5.3 Plan, targets | Wolf King: any number of human targets | `targeting::wolf_king_any_number_of_humans` |
| 19 | §5.3 Plan, targets | Knight: 1 werewolf target | `targeting::knight_accepts_werewolf_and_fool` |
| 20 | §5.3 Plan, targets | Seer: 1 werewolf target | `end_view_legal::legal_actions_cover_and_validate`, `showdown::seer_deals_two` |
| 21 | §5.3 Plan, targets | Wolfen and Wolf Beauty: 1 target of any faction | `targeting::wolfen_and_beauty_any_one` |
| 22 | §5.3 Plan, targets | Witch and Villager: the Fool only | `targeting::villager_and_witch_fool_only` |
| 23 | §5.3 Plan, targets | The Fool may be added to any plan and may be the only target | `targeting::knight_accepts_werewolf_and_fool`, `end_view_legal::legal_actions_cover_and_validate`, `plan_reveal::plan_may_target_own_hand_and_fool_alone` |
| 24 | §5.3 Plan, targets | Duplicate targets are rejected | `plan_reveal::plan_rejects_duplicate_targets` |
| 25 | §5.3 Plan | A target may name a card in the player's own hand | `plan_reveal::plan_may_target_own_hand_and_fool_alone` |
| 26 | §5.3 Plan | The number of targets is public once submitted; their identities are not | `plan_reveal::plan_target_count_public_identities_hidden`, `end_view_legal::view_redaction` |
| 27 | §5.3 Plan | Unchosen hand cards are discarded face-down and stay hidden | `plan_reveal::both_plans_clear_hands_and_open_hourglass_reveal`, `end_view_legal::view_redaction` |
| 28 | §5.3 Reveal A, B | The Badge holder places Hourglasses first, publicly; the other player then does the same | `plan_reveal::hourglass_order_badge_first` |
| 29 | §5.3 Reveal A, B | A player cannot place more Hourglasses than they hold | `plan_reveal::hourglass_over_reserve_rejected` |
| 30 | §5.3 Reveal C | A Potion holder must spend it by choosing one of their unplayed target cards | `plan_reveal::potion_holder_must_choose_unplayed_target`, `end_view_legal::legal_actions_for_potion_and_hunter` |
| 31 | §5.3 Reveal C | The Fool cannot be the Potion target | `end_view_legal::legal_actions_for_potion_and_hunter` |
| 32 | §5.3 Reveal C | The Potion target is revealed publicly and the Potion returns to the supply | `plan_reveal::potion_holder_must_choose_unplayed_target` |
| 33 | §5.3 Reveal D | Both plans are revealed; the Fool has no effect | `plan_reveal::reveal_without_potion_hands_off_and_returns_placed_hourglasses`, `showdown::wolf_king_payment_edges` |
| 34 | §5.3 Reveal | Effective initiative is printed initiative minus Hourglasses placed, never below 0 | `plan_reveal::initiative_clamps_and_tiebreaks_on_hourglasses` |
| 35 | §5.3 Reveal | Placed Hourglasses stay on the character through Showdown and return at round end | `showdown::hourglass_gain_takes_from_opponent_reserve_only`, `end_view_legal::round_end_returns_placed_and_passes_badge` |
| 36 | §5.3 Showdown 1 | The Potion resolves first | `showdown::witch_gains_potion_and_must_spend_next_round` |
| 37 | §5.3 Showdown 1 | A Potion naming the opponent's character eliminates it and costs its owner 1 Health | `showdown::witch_gains_potion_and_must_spend_next_round` |
| 38 | §5.3 Showdown 1 | The Potion works on any faction, including the Witch | `showdown::potion_eliminates_the_witch` |
| 39 | §5.3 Showdown 1 | A Potion naming a character the opponent did not play has no effect | `showdown::potion_naming_a_card_the_opponent_did_not_play_misses` |
| 40 | §5.3 Showdown 2 | Characters resolve from lowest effective initiative | `showdown::lower_initiative_attacks_first_and_wins`, `plan_reveal::lower_effective_initiative_goes_first_regardless_of_badge`, `showdown::hourglasses_let_seer_strike_first` |
| 41 | §5.3 Showdown 2 | A tie goes to the player who placed more Hourglasses, then to the Badge holder | `plan_reveal::initiative_clamps_and_tiebreaks_on_hourglasses` |
| 42 | §5.5 tiebreak | `BadgeOnly` skips the Hourglass comparison on ties | `plan_reveal::initiative_clamps_and_tiebreaks_on_hourglasses` |
| 43 | §5.3 Showdown 2 | An eliminated character does not resolve | `showdown::lower_initiative_attacks_first_and_wins`, `showdown::potion_eliminated_character_cannot_be_hit_again`, `showdown::witch_gains_potion_and_must_spend_next_round`, `showdown::potion_eliminated_knight_gains_no_hourglass` |
| 44 | §5.3 Showdown 3 | Effects apply in card order: gain or spend first, then the attack | `showdown::lower_initiative_attacks_first_and_wins`, `showdown::wolf_king_payment_edges` |
| 45 | §5.3 Showdown 3, Hunter | The owner chooses whether to spend 1 Cross; spending attacks all targets | `showdown::hunter_choice_spend_and_decline` |
| 46 | §5.3 Showdown 3, Hunter | With no Cross, or on declining, the Hunter does not attack | `showdown::hunter_without_cross_forfeits`, `showdown::hunter_spend_without_cross_forfeits`, `showdown::hunter_choice_spend_and_decline` |
| 47 | §5.3 Showdown 3, Wolf King | Pays Fangs equal to the non-Fool targets minus 1, then attacks all targets | `showdown::wolf_king_payment_edges`, `showdown::wolf_king_single_target_pays_nothing` |
| 48 | §5.3 Showdown 3, Wolf King | If the owner cannot pay in full they pay nothing and the whole attack fails | `showdown::wolf_king_payment_edges` |
| 49 | §5.3 Showdown 3, Knight | Gains 1 Hourglass, then attacks; a Knight eliminated by the Potion gains nothing | `showdown::lower_initiative_attacks_first_and_wins`, `showdown::hourglass_gain_takes_from_opponent_reserve_only`, `showdown::potion_eliminated_knight_gains_no_hourglass` |
| 50 | §5.3 Showdown 3, Wolfen | Gains 1 Hourglass, then attacks | `plan_reveal::reveal_without_potion_hands_off_and_returns_placed_hourglasses` |
| 51 | §5.3 Showdown 3, Seer | Attacks; a hit costs the opponent 2 Health | `showdown::seer_deals_two`, `end_view_legal::seer_damage_clamps_at_zero` |
| 52 | §5.3 Showdown 3, Witch | Gains the Potion | `showdown::witch_gains_potion_and_must_spend_next_round` |
| 53 | §5.3 Showdown 3, Wolf Beauty | Gains 1 Fang, then attacks | `showdown::hunter_choice_spend_and_decline`, `end_view_legal::wolf_beauty_third_fang_wins` |
| 54 | §5.3 Showdown 3, Villager | Gains exactly 1 Cross | `showdown::villager_gains_exactly_one_cross`, `end_view_legal::win_mid_showdown_stops_resolution` |
| 55 | §5.3 Showdown 4 | An attack hits if a target names the opponent's character and it has not yet resolved | `showdown::lower_initiative_attacks_first_and_wins`, `showdown::resolved_character_is_immune` |
| 56 | §5.3 Showdown 4 | A character that has already resolved is immune | `showdown::resolved_character_is_immune` |
| 57 | §5.3 Showdown 4 | A hit eliminates the character and costs its owner 1 Health (Seer: 2) | `showdown::lower_initiative_attacks_first_and_wins`, `showdown::seer_deals_two` |
| 58 | §5.3 Showdown 4 | A character can be eliminated only once, including after the Potion | `showdown::potion_eliminated_character_cannot_be_hit_again` |
| 59 | §5.3 Showdown 5 | Gains come from the supply | `showdown::lower_initiative_attacks_first_and_wins`, `showdown::hunter_choice_spend_and_decline` |
| 60 | §5.3 Showdown 5 | With an empty Hourglass supply the gain comes from the opponent's reserve, or nothing if they have none | `showdown::hourglass_gain_takes_from_opponent_reserve_only` |
| 61 | §5.3 Showdown 5 | Fang and Cross supplies cannot run out before someone wins; a crafted empty supply gains nothing | `setup::marker_totals_conserved`, `fuzz::fuzz_1000_games`, `showdown::empty_cross_supply_gains_nothing_without_panicking` |
| 62 | §5.3 Showdown 6 | Spent markers return to the supply | `showdown::hunter_choice_spend_and_decline`, `showdown::wolf_king_payment_edges` |
| 63 | §5.3 Round end | Placed Hourglasses return and the Badge passes; the game then waits in Round over, and deals the next round only when both players have asked for it once | `end_view_legal::round_end_returns_placed_and_passes_badge`, `end_view_legal::showdown_stops_in_round_over_before_the_deal`, `end_view_legal::next_round_deals_only_when_both_seats_are_ready`, `end_view_legal::duplicate_next_round_is_rejected`, `plan_reveal::reveal_without_potion_hands_off_and_returns_placed_hourglasses` |
| 63a | §5.3 Round end, §6.5 | A game won mid-showdown ends at once, with no Round over | `end_view_legal::win_mid_showdown_stops_resolution` |
| 63b | §6.5 Round over | The round boundary is Round over before either player is ready; resuming from it deals the next round from the new segment's seed | `replay::round_boundary_only_at_round_over_before_anyone_is_ready`, `replay::resume_from_boundary_makes_new_segment`, `replay::resumed_boundary_deals_from_the_new_seed` |
| 64 | §5.4 | A player at 0 Health loses | `end_view_legal::seer_damage_clamps_at_zero`, `end_view_legal::nothing_is_legal_after_game_over` |
| 65 | §5.4 | A player with 3 Fangs wins | `end_view_legal::wolf_beauty_third_fang_wins` |
| 66 | §5.4 | A player with 4 Crosses wins | `end_view_legal::win_mid_showdown_stops_resolution` |
| 67 | §5.4 | Win conditions are checked after every state change and end the game immediately | `end_view_legal::win_mid_showdown_stops_resolution`, `end_view_legal::wolf_beauty_third_fang_wins` |
| 68 | §5.4 | Resolution is sequential, so two results never happen at once; nothing is accepted afterwards | `end_view_legal::win_mid_showdown_stops_resolution`, `plan_reveal::game_over_rejects_everything`, `fuzz::fuzz_1000_games` |
| 69 | §5.5 | `tiebreak` selects the tie rule | `plan_reveal::initiative_clamps_and_tiebreaks_on_hourglasses` |
| 70 | §5.5 | `min_targets` selects 1 or 0, and no other value is accepted | `targeting::villager_and_witch_fool_only`, `end_view_legal::legal_actions_min_targets_zero_allow_no_targets`, `targeting::min_targets_is_zero_or_one_and_serialises_as_a_number` |
| 71 | §5.5 | `badge_start` selects random or a chosen seat | `setup::badge_start_random_and_chosen` |
| 72 | §5.5 | The config is fixed at game creation and stored in saves and replays | `replay::replay_reproduces_final_hash`, `replay::json_roundtrip` |
| 73 | Card: Hunter | Spend a Cross to attack two werewolves | `targeting::hunter_two_werewolves`, `showdown::hunter_choice_spend_and_decline` |
| 74 | Card: Wolf King | Attack a human, and one more per Fang paid | `targeting::wolf_king_any_number_of_humans`, `showdown::wolf_king_payment_edges` |
| 75 | Card: Knight | Gain an Hourglass; attack a werewolf. The gain applies even if the attack misses | `showdown::hourglass_gain_takes_from_opponent_reserve_only` |
| 76 | Card: Wolfen | Gain an Hourglass; attack anyone | `targeting::wolfen_and_beauty_any_one`, `plan_reveal::reveal_without_potion_hands_off_and_returns_placed_hourglasses` |
| 77 | Card: Seer | Attack a werewolf for 2 Health | `showdown::seer_deals_two` |
| 78 | Card: Witch | Gain the Potion; it must be spent at the next Reveal and hits first | `showdown::witch_gains_potion_and_must_spend_next_round` |
| 79 | Card: Wolf Beauty | Gain a Fang (three win); attack anyone | `end_view_legal::wolf_beauty_third_fang_wins`, `targeting::wolfen_and_beauty_any_one` |
| 80 | Card: Villager | Gain a Cross (four win); no attack | `showdown::villager_gains_exactly_one_cross`, `end_view_legal::win_mid_showdown_stops_resolution`, `targeting::villager_and_witch_fool_only` |
| 81 | FAQ 1 | The number of targets in a plan is public | `plan_reveal::plan_target_count_public_identities_hidden` |
| 82 | FAQ 2 | Only legal targets plus the Fool may be placed | `targeting::knight_accepts_werewolf_and_fool`, `plan_reveal::plan_is_validated_against_targeting_rules` |
| 83 | FAQ 3 | At least one target is required by default; 0 is a variant | `targeting::villager_and_witch_fool_only`, `end_view_legal::legal_actions_min_targets_zero_allow_no_targets` |
| 84 | FAQ 4 | The Hunter's owner chooses during Showdown whether to spend the Cross | `showdown::hunter_choice_spend_and_decline`, `end_view_legal::legal_actions_for_potion_and_hunter` |
| 85 | FAQ 5 | A Wolf King may place more targets than it has Fangs; the attack then fails at payment | `showdown::wolf_king_payment_edges` |
| 86 | FAQ 6 | Spent markers return; an empty Hourglass supply is taken from the opponent | `showdown::hunter_choice_spend_and_decline`, `showdown::hourglass_gain_takes_from_opponent_reserve_only` |
| 87 | FAQ 7 | The Badge holder in round 1 is random, or chosen in the lobby | `setup::badge_start_random_and_chosen` |
