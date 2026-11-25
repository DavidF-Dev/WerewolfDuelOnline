<script lang="ts">
  import { richMessage, type Localiser, type Translator } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import Screen from '../components/Screen.svelte';
  import Chip from '../kit/Chip.svelte';
  import IconButton from '../kit/IconButton.svelte';
  import Label from '../kit/Label.svelte';
  import ListRow from '../kit/ListRow.svelte';
  import Note from '../kit/Note.svelte';
  import Panel from '../kit/Panel.svelte';
  import RichText from '../kit/RichText.svelte';
  import Segmented from '../kit/Segmented.svelte';
  import Select from '../kit/Select.svelte';
  import Sheet from '../kit/Sheet.svelte';
  import Stepper from '../kit/Stepper.svelte';
  import Switch from '../kit/Switch.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();

  let theme = $state<'system' | 'light' | 'dark'>('system');
  let grace = $state<'5' | '10' | '30'>('10');
  let contrast = $state(false);
  let patterns = $state(true);
  let language = $state('system');
  let hourglasses = $state(0);
  let spare = $state(1);
  let sheetOpen = $state(false);

  const sample: Translator = {
    t: (id, args = {}) =>
      id === 'sample'
        ? `${args['player']}'s ${args['attacker']} hits your ${args['victim']}. You lose 1 ${args['marker']}.`
        : id,
  };
  const sentence = richMessage(
    sample,
    'sample',
    { player: 'Mika', attacker: 'Knight', victim: 'Wolfen', marker: 'Health' },
    { player: 'player', attacker: 'character', victim: 'character', marker: { marker: 'health' } },
  );
</script>

<Screen title="Kit" testId="kit">
  {#snippet left()}<IconButton icon="menu" label="Menu" />{/snippet}
  {#snippet right()}<IconButton icon="settings" label="Settings" />{/snippet}

  <Panel title="Buttons">
    <div class="stack">
      <Button variant="primary">Primary block</Button>
      <Button>Default block</Button>
      <Button variant="danger">Danger block</Button>
      <Button variant="danger-solid">Danger solid block</Button>
      <Button variant="primary" disabled>Disabled primary</Button>
    </div>
    <div class="row wrap">
      <Button size="small" variant="primary">Primary</Button>
      <Button size="small">Default</Button>
      <Button size="small" variant="danger">Danger</Button>
      <Button size="small" variant="danger-solid">Solid</Button>
    </div>
  </Panel>

  <Panel title="Controls" tight>
    <div class="set">
      <span id="kit-theme">Theme</span>
      <Segmented
        labelledby="kit-theme"
        value={theme}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onchange={(value) => (theme = value)}
      />
    </div>
    <div class="set">
      <span id="kit-grace">Reconnect grace</span>
      <Segmented
        labelledby="kit-grace"
        value={grace}
        options={[
          { value: '5', label: '5 min' },
          { value: '10', label: '10 min' },
          { value: '30', label: '30 min' },
        ]}
        onchange={(value) => (grace = value)}
      />
    </div>
    <div class="set">
      <label for="kit-contrast">High contrast</label>
      <Switch
        id="kit-contrast"
        checked={contrast}
        onText={l.t('toggle-on')}
        offText={l.t('toggle-off')}
        onchange={(value) => (contrast = value)}
      />
    </div>
    <div class="set">
      <label for="kit-patterns">Colour-blind patterns</label>
      <Switch
        id="kit-patterns"
        checked={patterns}
        onText={l.t('toggle-on')}
        offText={l.t('toggle-off')}
        onchange={(value) => (patterns = value)}
      />
    </div>
    <div class="set">
      <label for="kit-language">Language</label>
      <Select
        id="kit-language"
        value={language}
        onchange={(event) => (language = event.currentTarget.value)}
      >
        <option value="system">System (English)</option>
        <option value="en">English</option>
      </Select>
    </div>
  </Panel>

  <Panel title="Steppers">
    <div class="set">
      <Stepper
        label="Hourglasses at the minimum"
        decreaseLabel="Fewer"
        increaseLabel="More"
        value={hourglasses}
        min={0}
        max={2}
        onchange={(value) => (hourglasses = value)}
      />
      <Stepper
        label="Hourglasses in range"
        decreaseLabel="Fewer"
        increaseLabel="More"
        value={spare}
        min={0}
        max={2}
        onchange={(value) => (spare = value)}
      />
    </div>
  </Panel>

  <Panel>
    <Label>Untitled panel with a label</Label>
    <div class="row wrap">
      <Chip>plan sealed · 1 target</Chip>
      <Chip>waiting for you</Chip>
    </div>
    <ul class="list">
      <ListRow>
        <b>vs Mika</b>
        <div class="muted">Round 4 · your turn</div>
        {#snippet end()}<Button size="small" variant="primary">Resume</Button>{/snippet}
      </ListRow>
      <ListRow>
        <b>vs Jo</b>
        <div class="muted">Paused · Round 2</div>
        {#snippet end()}<Button size="small">Resume</Button>{/snippet}
      </ListRow>
    </ul>
    <Note>Lower resolves first. On a tie, more Hourglasses goes first, then the Badge.</Note>
    <p class="sentence"><RichText parts={sentence} /></p>
  </Panel>

  <Panel title="Sheet" tight>
    <Button data-testid="kit-open-sheet" onclick={() => (sheetOpen = true)}>Open a sheet</Button>
  </Panel>
</Screen>

{#if sheetOpen}
  <Sheet
    title="Game menu"
    closeLabel="Close"
    testId="kit-sheet"
    onclose={() => (sheetOpen = false)}
  >
    <Button>Pause</Button>
    <Button variant="danger">Resign</Button>
  </Sheet>
{/if}

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 10px;
  }

  .row {
    align-items: center;
    display: flex;
    gap: 8px;
    min-height: var(--target);
  }

  .wrap {
    flex-wrap: wrap;
    row-gap: 14px;
  }

  .set {
    align-items: center;
    border-bottom: 1px solid var(--line);
    display: flex;
    gap: 8px;
    justify-content: space-between;
    min-height: var(--target);
  }

  .set:last-child {
    border-bottom: 0;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .muted {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .sentence {
    margin: 8px 0 0;
  }
</style>
