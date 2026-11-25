import { getContext, setContext, type Snippet } from 'svelte';

/** A primary action a phase panel hands to the phase bar. */
export interface HostedAction {
  /** Stays the same for as long as the panel is mounted. */
  id: number;
  /** The action to render. */
  action: () => Snippet;
  /** Whether the action is offered right now. */
  shown: () => boolean;
}

/** An instruction a phase panel hands to the phase bar. */
interface HostedInstruction {
  content: () => Snippet;
  /** Whether the instruction applies right now. */
  shown: () => boolean;
}

/** Where the phase bar finds the primary actions and the instruction that the phase panels hand it. */
export class PrimarySlot {
  /** Every handed action in the order the panels mounted, shown or not. */
  actions: readonly HostedAction[] = $state.raw([]);
  /** Every handed instruction in the order the panels mounted; the last one offered is shown. */
  instructions: readonly HostedInstruction[] = $state.raw([]);
  // The lists kept outside the reactive state, since a panel being torn down may read stale state.
  #held: HostedAction[] = [];
  #heldInstructions: HostedInstruction[] = [];
  #next = 0;

  /** The actions offered right now. */
  get shown(): HostedAction[] {
    return this.actions.filter((hosted) => hosted.shown());
  }

  /** The instruction a panel shows in place of the phase's own, if any. */
  get instruction(): Snippet | null {
    return this.instructions.findLast((hosted) => hosted.shown())?.content() ?? null;
  }

  /** Adds an action; returns a function that takes it away again. */
  add(action: () => Snippet, shown: () => boolean): () => void {
    const entry: HostedAction = { id: this.#next++, action, shown };
    this.#held = [...this.#held, entry];
    this.actions = this.#held;
    return () => {
      this.#held = this.#held.filter((e) => e !== entry);
      this.actions = this.#held;
    };
  }

  /** Adds an instruction; returns a function that takes it away again. */
  addInstruction(content: () => Snippet, shown: () => boolean = () => true): () => void {
    const entry: HostedInstruction = { content, shown };
    this.#heldInstructions = [...this.#heldInstructions, entry];
    this.instructions = this.#heldInstructions;
    return () => {
      this.#heldInstructions = this.#heldInstructions.filter((e) => e !== entry);
      this.instructions = this.#heldInstructions;
    };
  }
}

const KEY = Symbol('phase-primary');

/** Gives the panels inside this component a phase bar to hand their primary actions to. */
export function providePrimary(): PrimarySlot {
  return setContext(KEY, new PrimarySlot());
}

/**
 * Hands `action` to the phase bar for as long as the calling panel is mounted; the bar shows it
 * while `shown` is true. Returns whether there is a phase bar; without one the panel shows it.
 */
export function handPrimary(action: () => Snippet, shown: () => boolean = () => true): boolean {
  const slot = getContext<PrimarySlot | undefined>(KEY);
  if (slot === undefined) return false;
  $effect.pre(() => slot.add(action, shown));
  return true;
}

/**
 * Hands `content` to the phase bar as its instruction for as long as the calling panel is
 * mounted; the bar shows it while `shown` is true. Returns whether there is a phase bar; without
 * one the panel shows it.
 */
export function handInstruction(
  content: () => Snippet,
  shown: () => boolean = () => true,
): boolean {
  const slot = getContext<PrimarySlot | undefined>(KEY);
  if (slot === undefined) return false;
  $effect.pre(() => slot.addInstruction(content, shown));
  return true;
}
