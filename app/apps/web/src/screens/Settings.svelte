<script lang="ts">
  import { onMount } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import { MAX_NAME_LENGTH } from '@wwd/protocol';
  import { canShareBackup, exportBackup, saveBackup, shareBackup } from '../backup/export.js';
  import { BackupError, backupFileName, type BackupFile } from '../backup/format.js';
  import {
    mergeBackup,
    previewBackup,
    readBackup,
    type BackupPreview as Preview,
  } from '../backup/import.js';
  import BackupPreview from '../components/BackupPreview.svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import DeleteDataDialog from '../components/DeleteDataDialog.svelte';
  import Screen from '../components/Screen.svelte';
  import WarningIcon from '../components/WarningIcon.svelte';
  import { getDeviceStore, patchSettings } from '../device-store.js';
  import { parseServer } from '../online.js';
  import { install, promptInstall } from '../pwa/install.js';
  import { hrefFor, navigate } from '../router.js';
  import { clearSession, reloadSessions } from '../session.js';
  import { clearLocalSessions } from '../storage/migrations.js';
  import { applySettings } from '../settings/apply.js';
  import Choice from '../settings/Choice.svelte';
  import SettingsGroup from '../settings/SettingsGroup.svelte';
  import {
    DEFAULT_SETTINGS,
    TEXT_SIZE_MAX,
    TEXT_SIZE_MIN,
    TEXT_SIZE_STEP,
    clampTextSize,
    type Settings,
  } from '../settings/settings.js';
  import Toggle from '../settings/Toggle.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
  const uid = $props.id();
  const store = getDeviceStore();
  const ENGLISH = 'English';

  let writes: Promise<void> = Promise.resolve();
  let loaded = $state(false);
  let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  let displayName = $state('');
  let serverMode = $state<'default' | 'custom'>('default');
  let serverText = $state('');
  let serverProblem = $state(false);
  let serverSaved = $state(false);

  onMount(() => {
    void (async () => {
      try {
        if (store !== undefined) {
          settings = await store.settings.get();
          displayName = (await store.identity.get()).displayName ?? '';
        }
      } catch {
        // The defaults stay on screen and changes still apply.
      }
      if (settings.server !== null) {
        serverMode = 'custom';
        serverText = settings.server;
      }
      loaded = true;
    })();
  });

  function update(patch: Partial<Settings>): void {
    settings = { ...settings, ...patch };
    applySettings(settings, document.documentElement);
    writes = patchSettings(patch);
  }

  async function saveDisplayName(): Promise<void> {
    const name = displayName.trim();
    displayName = name;
    if (store === undefined) return;
    try {
      const { displayName: _previous, ...identity } = await store.identity.get();
      await store.identity.put(name === '' ? identity : { ...identity, displayName: name });
    } catch {
      // The name stays as typed for this visit.
    }
  }

  function chooseServerMode(mode: 'default' | 'custom'): void {
    serverMode = mode;
    serverProblem = false;
    serverSaved = false;
    if (mode === 'default' && settings.server !== null) update({ server: null });
  }

  function saveServer(event: SubmitEvent): void {
    event.preventDefault();
    const server = parseServer(serverText.trim(), true);
    serverSaved = server !== undefined;
    serverProblem = server === undefined;
    if (server === undefined) return;
    serverText = server;
    update({ server });
  }
  type Result = 'saved' | 'cancelled' | 'failed';

  let exportFile = $state.raw<File | null>(null);
  let pendingImport = $state.raw<{ backup: BackupFile; preview: Preview } | null>(null);
  let replaceSettings = $state(false);
  let deleting = $state<'history' | 'all' | null>(null);
  let notice = $state('');
  let problem = $state('');
  let fileInput = $state<HTMLInputElement>();

  const reportProblem = (text: string): void => {
    notice = '';
    problem = text;
  };
  const reportNotice = (text: string): void => {
    problem = '';
    notice = text;
  };

  async function backupFile(): Promise<File> {
    if (store === undefined) throw new Error('no device store');
    const blob = await exportBackup(store);
    return new File([blob], backupFileName(new Date()), { type: blob.type });
  }

  async function startExport(): Promise<void> {
    try {
      exportFile = await backupFile();
    } catch {
      reportProblem(l.t('backup-save-failed'));
    }
  }

  async function finishExport(send: (file: File) => Promise<'saved' | 'cancelled'>): Promise<void> {
    const file = exportFile;
    exportFile = null;
    if (file === null) return;
    try {
      if ((await send(file)) === 'saved') reportNotice(l.t('backup-saved'));
    } catch {
      reportProblem(l.t('backup-save-failed'));
    }
  }

  async function exportBeforeDeleting(): Promise<Result> {
    try {
      return await saveBackup(await backupFile(), l.t('backup-file-label'));
    } catch {
      return 'failed';
    }
  }

  async function chooseBackup(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined || store === undefined) return;
    try {
      const backup = await readBackup(file);
      replaceSettings = false;
      pendingImport = { backup, preview: await previewBackup(store, backup) };
    } catch (error) {
      const reason = error instanceof BackupError ? error.reason : 'corrupt';
      reportProblem(l.t(`backup-error-${reason}`));
    }
  }

  async function confirmImport(): Promise<void> {
    const pending = pendingImport;
    pendingImport = null;
    if (pending === null || store === undefined) return;
    try {
      await writes;
      const { added, updated } = await mergeBackup(store, pending.backup, {
        settings: replaceSettings,
      });
      await reloadSessions(store);
      if (replaceSettings) {
        settings = await store.settings.get();
        applySettings(settings, document.documentElement);
      }
      displayName = (await store.identity.get()).displayName ?? '';
      reportNotice(l.t('backup-import-done', { added, updated }));
    } catch {
      reportProblem(l.t('backup-import-failed'));
    }
  }

  async function confirmDelete(): Promise<void> {
    const scope = deleting;
    deleting = null;
    if (scope === null || store === undefined) return;
    try {
      await writes;
      if (scope === 'history') {
        await store.history.clear();
        reportNotice(l.t('delete-history-done'));
        return;
      }
      await store.clearAll();
      await reloadSessions(store);
      clearSession();
      clearLocalSessions();
      applySettings(DEFAULT_SETTINGS, document.documentElement);
      navigate('home');
    } catch {
      reportProblem(l.t('delete-failed'));
    }
  }
</script>

<Screen title={l.t('settings-heading')} testId="settings" backLabel={l.t('back')}>
  {#if loaded}
    <SettingsGroup title={l.t('settings-general')}>
      {#if $install !== 'unavailable'}
        <div class="row" data-testid="install-row">
          <span>{l.t('settings-install')}</span>
          {#if $install === 'prompt'}
            <button type="button" onclick={() => void promptInstall()}
              >{l.t('install-button')}</button
            >
          {:else if $install === 'ios'}
            <span>{l.t('install-ios-steps')}</span>
          {:else}
            <span>{l.t('settings-installed')}</span>
          {/if}
        </div>
      {/if}
      <label class="row">
        <span>{l.t('settings-language')}</span>
        <select
          value={settings.language}
          onchange={(event) =>
            update({ language: event.currentTarget.value as Settings['language'] })}
        >
          <option value="system">{l.t('settings-language-system', { language: ENGLISH })}</option>
          <option value="en">{ENGLISH}</option>
        </select>
      </label>
      <Choice
        legend={l.t('settings-theme')}
        value={settings.theme}
        options={[
          { value: 'system', label: l.t('settings-theme-system') },
          { value: 'light', label: l.t('settings-theme-light') },
          { value: 'dark', label: l.t('settings-theme-dark') },
        ]}
        onchange={(theme) => update({ theme })}
      />
      <div class="field">
        <label for="{uid}-name">{l.t('settings-display-name')}</label>
        <input
          id="{uid}-name"
          type="text"
          autocomplete="nickname"
          maxlength={MAX_NAME_LENGTH}
          aria-describedby="{uid}-name-hint"
          bind:value={displayName}
          onchange={saveDisplayName}
        />
        <span id="{uid}-name-hint" class="note">{l.t('settings-display-name-hint')}</span>
      </div>
    </SettingsGroup>

    <SettingsGroup title={l.t('settings-reading')}>
      <label class="field">
        <span>{l.t('settings-text-size', { percent: settings.textSize })}</span>
        <input
          type="range"
          min={TEXT_SIZE_MIN}
          max={TEXT_SIZE_MAX}
          step={TEXT_SIZE_STEP}
          value={settings.textSize}
          oninput={(event) =>
            update({ textSize: clampTextSize(Number(event.currentTarget.value)) })}
        />
      </label>
      <Choice
        legend={l.t('settings-reading-font')}
        value={settings.readingFont}
        options={[
          { value: 'default', label: l.t('settings-font-default') },
          { value: 'lexend', label: 'Lexend' },
          { value: 'opendyslexic', label: 'OpenDyslexic' },
        ]}
        onchange={(readingFont) => update({ readingFont })}
      />
      <Toggle
        label={l.t('settings-extra-spacing')}
        checked={settings.extraSpacing}
        onText={l.t('toggle-on')}
        offText={l.t('toggle-off')}
        onchange={(extraSpacing) => update({ extraSpacing })}
      />
      <Choice
        legend={l.t('settings-card-text')}
        value={settings.cardText}
        options={[
          { value: 'icons-and-text', label: l.t('settings-card-text-icons') },
          { value: 'text-only', label: l.t('settings-card-text-only') },
        ]}
        onchange={(cardText) => update({ cardText })}
      />
    </SettingsGroup>

    <SettingsGroup title={l.t('settings-accessibility')}>
      <Toggle
        label={l.t('settings-high-contrast')}
        checked={settings.highContrast}
        onText={l.t('toggle-on')}
        offText={l.t('toggle-off')}
        onchange={(highContrast) => update({ highContrast })}
      />
      <Toggle
        label={l.t('settings-colour-blind-patterns')}
        checked={settings.colourBlindPatterns}
        onText={l.t('toggle-on')}
        offText={l.t('toggle-off')}
        onchange={(colourBlindPatterns) => update({ colourBlindPatterns })}
      />
      <Choice
        legend={l.t('settings-reduced-motion')}
        value={settings.reducedMotion}
        options={[
          { value: 'system', label: l.t('settings-motion-system') },
          { value: 'on', label: l.t('settings-motion-on') },
          { value: 'off', label: l.t('settings-motion-off') },
        ]}
        onchange={(reducedMotion) => update({ reducedMotion })}
      />
      <Choice
        legend={l.t('settings-showdown-speed')}
        value={settings.showdownSpeed}
        options={[
          { value: 'step', label: l.t('settings-speed-step') },
          { value: 'auto', label: l.t('settings-speed-auto') },
          { value: 'instant', label: l.t('settings-speed-instant') },
        ]}
        onchange={(showdownSpeed) => update({ showdownSpeed })}
      />
      <Toggle
        label={l.t('settings-haptics')}
        checked={settings.haptics}
        onText={l.t('toggle-on')}
        offText={l.t('toggle-off')}
        onchange={(haptics) => update({ haptics })}
      />
    </SettingsGroup>

    <SettingsGroup title={l.t('settings-gameplay')}>
      <Toggle
        label={l.t('settings-confirm-plan')}
        checked={settings.confirmPlan}
        onText={l.t('toggle-on')}
        offText={l.t('toggle-off')}
        onchange={(confirmPlan) => update({ confirmPlan })}
      />
      <Toggle
        label={l.t('settings-rules-hints')}
        checked={settings.rulesHints}
        onText={l.t('toggle-on')}
        offText={l.t('toggle-off')}
        onchange={(rulesHints) => update({ rulesHints })}
      />
      <Toggle
        label={l.t('settings-deduction-auto-mark')}
        checked={settings.deductionAutoMark}
        onText={l.t('toggle-on')}
        offText={l.t('toggle-off')}
        onchange={(deductionAutoMark) => update({ deductionAutoMark })}
      />
    </SettingsGroup>

    <SettingsGroup title={l.t('settings-network')}>
      <Choice
        legend={l.t('settings-server')}
        value={serverMode}
        options={[
          { value: 'default', label: l.t('settings-server-default') },
          { value: 'custom', label: l.t('settings-server-custom') },
        ]}
        onchange={chooseServerMode}
      />
      {#if serverMode === 'custom'}
        <form class="field" onsubmit={saveServer}>
          <label for="{uid}-server">{l.t('settings-server-address')}</label>
          <input
            id="{uid}-server"
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            aria-invalid={serverProblem ? 'true' : undefined}
            aria-describedby={serverProblem ? `${uid}-server-problem` : undefined}
            bind:value={serverText}
            oninput={() => {
              serverProblem = false;
              serverSaved = false;
            }}
          />
          <button type="submit">{l.t('settings-server-save')}</button>
          {#if serverProblem}
            <p id="{uid}-server-problem" class="problem" role="alert">
              <span aria-hidden="true">⚠</span>
              {l.t('settings-server-invalid')}
            </p>
          {/if}
          {#if serverSaved}
            <p role="status">{l.t('settings-server-saved')}</p>
          {/if}
        </form>
      {/if}
    </SettingsGroup>

    <SettingsGroup title={l.t('settings-data')}>
      <p>{l.t('settings-data-note')}</p>
      {#if store !== undefined}
        {#if !store.persistent}
          <p class="note">{l.t('settings-data-memory-only')}</p>
        {/if}
        <div class="row">
          <span>{l.t('settings-data-backup')}</span>
          <span class="actions">
            <button type="button" onclick={startExport}>{l.t('settings-data-export')}</button>
            <button type="button" onclick={() => fileInput?.click()}
              >{l.t('settings-data-import')}</button
            >
          </span>
        </div>
        <input
          type="file"
          accept=".wwdb"
          hidden
          aria-label={l.t('backup-file-label')}
          data-testid="backup-file"
          bind:this={fileInput}
          onchange={chooseBackup}
        />
        <div class="row">
          <span>{l.t('settings-data-history')}</span>
          <button type="button" class="danger" onclick={() => (deleting = 'history')}>
            <WarningIcon />{l.t('settings-data-clear-history')}
          </button>
        </div>
        <div class="row">
          <span>{l.t('settings-data-everything')}</span>
          <button type="button" class="danger" onclick={() => (deleting = 'all')}>
            <WarningIcon />{l.t('settings-data-delete-all')}
          </button>
        </div>
        {#if notice !== ''}
          <p role="status">{notice}</p>
        {/if}
        {#if problem !== ''}
          <p class="problem" role="alert"><WarningIcon />{problem}</p>
        {/if}
      {/if}
    </SettingsGroup>

    {#if exportFile !== null}
      <ConfirmDialog
        title={l.t('backup-export-title')}
        detail={l.t('backup-seat-token-warning')}
        confirmLabel={l.t('backup-export-confirm')}
        cancelLabel={l.t('backup-export-cancel')}
        onConfirm={() => void finishExport((file) => saveBackup(file, l.t('backup-file-label')))}
        onCancel={() => (exportFile = null)}
      >
        {#if canShareBackup(exportFile)}
          <p>
            <button type="button" onclick={() => void finishExport(shareBackup)}
              >{l.t('backup-export-share')}</button
            >
          </p>
        {/if}
      </ConfirmDialog>
    {/if}

    {#if pendingImport !== null}
      <ConfirmDialog
        title={l.t('backup-import-title')}
        confirmLabel={l.t('backup-import-confirm')}
        cancelLabel={l.t('backup-import-cancel')}
        onConfirm={() => void confirmImport()}
        onCancel={() => (pendingImport = null)}
      >
        <BackupPreview localiser={l} preview={pendingImport.preview} bind:replaceSettings />
      </ConfirmDialog>
    {/if}

    {#if deleting !== null}
      <DeleteDataDialog
        localiser={l}
        scope={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => (deleting = null)}
        onExport={exportBeforeDeleting}
      />
    {/if}

    <p><a href={hrefFor('about')}>{l.t('settings-about-link')}</a></p>
  {/if}
</Screen>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-block: 0.75rem;
  }

  .field button {
    align-self: flex-start;
  }

  .problem {
    color: var(--danger);
    font-weight: 600;
    margin: 0;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .danger {
    border-color: var(--danger);
    color: var(--danger);
    font-weight: 600;
  }

  [role='status'] {
    margin: 0;
  }
</style>
