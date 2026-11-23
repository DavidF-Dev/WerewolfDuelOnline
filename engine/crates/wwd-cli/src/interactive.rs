//! Hot-seat play on a terminal. Only the acting seat's view is ever printed.

use std::io::{self, BufRead, IsTerminal, Write};

use wwd_core::{
    Command, Phase, PlanView, PlayerView, Recorder, Replay, RulesConfig, Seat, State, Viewer,
    Visibility, can_resign, events_since, legal_actions, pending, view,
};

use crate::render::{Locale, args, hex};

/// Plans are listed per character when there are more choices than this.
const GROUP_THRESHOLD: usize = 20;

pub struct Session {
    pub replay: Replay,
}

/// Plays a game at the terminal until it ends or a player quits.
pub fn play(loc: &Locale, seed: [u8; 32], config: RulesConfig) -> Session {
    let mut recorder = Recorder::new(seed, config);
    let mut input = io::stdin().lock().lines();
    let mut seen = [0u32; 2];
    let mut last = Vec::new();
    // A rejected command's message, shown to the same seat after the screen is cleared.
    let mut rejected: Option<String> = None;

    while !matches!(recorder.state().phase, Phase::GameOver { .. }) {
        let Some(&seat) = pending(recorder.state()).seats.first() else {
            break;
        };
        clear_screen();
        println!(
            "{}",
            loc.text("cli-pass-to-player", &args!("n" => seat.index() as u32 + 1))
        );
        if next_line(&mut input).is_none() {
            break;
        }
        clear_screen();
        if let Some(message) = rejected.take() {
            println!("{message}");
        }
        show_view(loc, recorder.state(), seat, &mut seen[seat.index()]);

        let actions = legal_actions(recorder.state(), seat);
        let Some(cmd) = choose(
            loc,
            &actions,
            can_resign(recorder.state(), seat),
            &mut input,
        ) else {
            break;
        };
        match recorder.apply(seat, cmd) {
            Ok(events) => last = events,
            Err(err) => rejected = Some(loc.rule_error(err)),
        }
    }

    if let Phase::GameOver { winner, reason } = recorder.state().phase {
        clear_screen();
        for event in last.iter().filter(|e| e.visibility == Visibility::Public) {
            println!("{}", loc.event(&event.kind));
        }
        println!(
            "{}",
            loc.text(
                "cli-game-over",
                &args!("winner" => loc.seat(winner), "reason" => loc.win_reason(reason)),
            )
        );
        println!("{}", loc.text("cli-seed", &args!("seed" => hex(&seed))));
    }
    Session {
        replay: recorder.replay().clone(),
    }
}

/// Clears the screen and scrollback so the previous player's information is gone.
fn clear_screen() {
    if io::stdout().is_terminal() {
        print!("\x1b[2J\x1b[3J\x1b[H");
        let _ = io::stdout().flush();
    }
}

fn next_line(input: &mut impl Iterator<Item = io::Result<String>>) -> Option<String> {
    input.next().and_then(Result::ok)
}

fn show_view(loc: &Locale, state: &State, seat: Seat, seen: &mut u32) {
    for (_, event) in events_since(state, *seen, Viewer::Seat(seat)) {
        println!("{}", loc.event(&event.kind));
    }
    *seen = u32::try_from(state.log.len()).expect("log length fits in u32");
    let view = view(state, Viewer::Seat(seat));
    println!(
        "{}",
        loc.text(
            "cli-your-view",
            &args!("round" => view.round, "badge" => loc.seat(view.badge)),
        )
    );
    let own = &view.players[seat.index()];
    if let Some(hand) = &own.hand
        && !hand.is_empty()
    {
        println!(
            "{}",
            loc.text("cli-your-hand", &args!("cards" => loc.character_list(hand)))
        );
    }
    println!("{}", markers_line(loc, "cli-your-markers", own));
    println!(
        "{}",
        markers_line(
            loc,
            "cli-opponent-markers",
            &view.players[seat.other().index()]
        )
    );
    if let PlanView::Revealed(plan) = &own.plan {
        println!("{}", loc.plan(plan));
    }
}

fn markers_line(loc: &Locale, id: &str, player: &PlayerView) -> String {
    loc.text(
        id,
        &args!(
            "health" => u32::from(player.health),
            "cross" => u32::from(player.cross),
            "fang" => u32::from(player.fang),
            "hourglass" => u32::from(player.hourglass),
            "placed" => u32::from(player.placed),
            "potion" => if player.potion { "yes" } else { "no" },
        ),
    )
}

/// Asks for a numbered choice, with a final "Resign" option when `resignable`. `None` means
/// the player quit or input ended.
fn choose(
    loc: &Locale,
    actions: &[Command],
    resignable: bool,
    input: &mut impl Iterator<Item = io::Result<String>>,
) -> Option<Command> {
    if actions.len() > GROUP_THRESHOLD {
        let mut characters: Vec<_> = actions
            .iter()
            .filter_map(|cmd| match cmd {
                Command::SubmitPlan { character, .. } => Some(*character),
                _ => None,
            })
            .collect();
        characters.dedup();
        if !characters.is_empty() {
            let mut labels: Vec<String> = characters.iter().map(|&c| loc.character(c)).collect();
            if resignable {
                labels.push(loc.command(&Command::Resign));
            }
            let picked = ask(loc, "cli-choose-character", &labels, input)?;
            if picked == characters.len() {
                return Some(Command::Resign);
            }
            let character = characters[picked];
            let own: Vec<Command> = actions
                .iter()
                .filter(|cmd| {
                    matches!(cmd, Command::SubmitPlan { character: c, .. } if *c == character)
                })
                .cloned()
                .collect();
            return pick(loc, &own, input);
        }
    }
    let mut offered = actions.to_vec();
    if resignable {
        offered.push(Command::Resign);
    }
    pick(loc, &offered, input)
}

fn pick(
    loc: &Locale,
    actions: &[Command],
    input: &mut impl Iterator<Item = io::Result<String>>,
) -> Option<Command> {
    let labels: Vec<String> = actions.iter().map(|cmd| loc.command(cmd)).collect();
    let picked = ask(loc, "cli-choose", &labels, input)?;
    Some(actions[picked].clone())
}

fn ask(
    loc: &Locale,
    prompt: &str,
    labels: &[String],
    input: &mut impl Iterator<Item = io::Result<String>>,
) -> Option<usize> {
    for (i, label) in labels.iter().enumerate() {
        println!("  {}) {label}", i + 1);
    }
    loop {
        println!("{}", loc.plain(prompt));
        let _ = io::stdout().flush();
        let line = next_line(input)?;
        let line = line.trim();
        if line.eq_ignore_ascii_case("q") {
            return None;
        }
        match line.parse::<usize>() {
            Ok(n) if (1..=labels.len()).contains(&n) => return Some(n - 1),
            _ => println!("{}", loc.plain("cli-invalid-choice")),
        }
    }
}
