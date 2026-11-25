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
  import Button from '../components/Button.svelte';
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
  import Note from '../kit/Note.svelte';
  import Select from '../kit/Select.svelte';
  import { applySettings } from '../settings/apply.js';
  import Choice from '../settings/Choice.svelte';
  import { COPYRIGHT } from '../credits.js';
  import SettingsGroup from '../settings/SettingsGroup.svelte';
  import { DEFAULT_SETTINGS, TEXT_SIZES, type Settings } from '../settings/settings.js';
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

<Screen title={l.t('settings-heading')} testId="settings" back={l.t('back')} tight>
  {#if loaded}
    <SettingsGroup title={l.t('settings-general')}>
      <div data-part="setting">
        <label for="{uid}-language" data-part="setting-name">{l.t('settings-language')}</label>
        <span data-part="setting-control">
          <Select
            id="{uid}-language"
            value={settings.language}
            onchange={(event) =>
              update({ language: event.currentTarget.value as Settings['language'] })}
          >
            <option value="system">{l.t('settings-language-system', { language: ENGLISH })}</option>
            <option value="en">{ENGLISH}</option>
          </Select>
        </span>
      </div>
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
      <div data-part="setting">
        <label for="{uid}-name" data-part="setting-name">{l.t('settings-display-name')}</label>
        <span data-part="setting-control" class="box">
          <input
            id="{uid}-name"
            type="text"
            autocomplete="nickname"
            maxlength={MAX_NAME_LENGTH}
            aria-describedby="{uid}-name-hint"
            bind:value={displayName}
            onchange={saveDisplayName}
          />
        </span>
        <span id="{uid}-name-hint" class="note hint">{l.t('settings-display-name-hint')}</span>
      </div>
      {#if $install !== 'unavailable'}
        <div data-part="setting" data-testid="install-row">
          <span data-part="setting-name">{l.t('settings-install')}</span>
          {#if $install === 'prompt'}
            <span data-part="setting-control">
              <Button size="small" onclick={() => void promptInstall()}
                >{l.t('install-button')}</Button
              >
            </span>
          {:else if $install === 'ios'}
            <span data-part="setting-control" class="note steps">{l.t('install-ios-steps')}</span>
          {:else}
            <span data-part="setting-control">{l.t('settings-installed')}</span>
          {/if}
        </div>
      {/if}
    </SettingsGroup>

    <SettingsGroup title={l.t('settings-reading')}>
      <Choice
        legend={l.t('settings-text-size')}
        value={String(settings.textSize)}
        options={TEXT_SIZES.map((percent) => ({
          value: String(percent),
          label: l.t('settings-text-size-option', { percent }),
        }))}
        onchange={(size) => update({ textSize: Number(size) })}
      />
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
    </SettingsGroup>

    <SettingsGroup title={l.t('settings-network')}>
      <div data-part="setting">
        <label for="{uid}-server-mode" data-part="setting-name">{l.t('settings-server')}</label>
        <span data-part="setting-control">
          <Select
            id="{uid}-server-mode"
            data-testid="server-mode"
            value={serverMode}
            onchange={(event) =>
              chooseServerMode(event.currentTarget.value as 'default' | 'custom')}
          >
            <option value="default">{l.t('settings-server-default')}</option>
            <option value="custom">{l.t('settings-server-custom')}</option>
          </Select>
        </span>
      </div>
      {#if serverMode === 'custom'}
        <form class="field" onsubmit={saveServer}>
          <label for="{uid}-server">{l.t('settings-server-address')}</label>
          <span class="box">
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
          </span>
          <Button type="submit" size="small">{l.t('settings-server-save')}</Button>
          {#if serverProblem}
            <p id="{uid}-server-problem" class="problem" role="alert">
              <WarningIcon />{l.t('settings-server-invalid')}
            </p>
          {/if}
          {#if serverSaved}
            <p role="status">{l.t('settings-server-saved')}</p>
          {/if}
        </form>
      {/if}
    </SettingsGroup>

    <SettingsGroup title={l.t('settings-data')}>
      <p class="note intro">{l.t('settings-data-note')}</p>
      {#if store !== undefined}
        {#if !store.persistent}
          <Note>{l.t('settings-data-memory-only')}</Note>
        {/if}
        <div data-part="setting">
          <span data-part="setting-name">{l.t('settings-data-backup')}</span>
          <span data-part="setting-control">
            <Button size="small" onclick={startExport}>{l.t('settings-data-export')}</Button>
            <Button size="small" onclick={() => fileInput?.click()}
              >{l.t('settings-data-import')}</Button
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
        <div data-part="setting">
          <span data-part="setting-name">{l.t('settings-data-history')}</span>
          <span data-part="setting-control">
            <Button size="small" variant="danger" onclick={() => (deleting = 'history')}
              >{l.t('settings-data-clear-history')}</Button
            >
          </span>
        </div>
        <div data-part="setting">
          <span data-part="setting-name">{l.t('settings-data-everything')}</span>
          <span data-part="setting-control">
            <Button size="small" variant="danger" onclick={() => (deleting = 'all')}
              >{l.t('settings-data-delete-all')}</Button
            >
          </span>
        </div>
        {#if notice !== ''}
          <p role="status">{notice}</p>
        {/if}
        {#if problem !== ''}
          <p class="problem" role="alert"><WarningIcon />{problem}</p>
        {/if}
      {/if}
    </SettingsGroup>

    <SettingsGroup title={l.t('settings-about')}>
      <div data-part="setting">
        <span data-part="setting-name">{l.t('about-version', { version: __APP_VERSION__ })}</span>
        <span data-part="setting-control">
          <a class="link hit-area" href={hrefFor('about')}>{l.t('settings-credits')}</a>
          <a class="link hit-area" href={hrefFor('about')}>{l.t('settings-licences')}</a>
        </span>
      </div>
      <p class="note copyright">{COPYRIGHT}</p>
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
        {#snippet alternatives()}
          {#if exportFile !== null && canShareBackup(exportFile)}
            <Button onclick={() => void finishExport(shareBackup)}
              >{l.t('backup-export-share')}</Button
            >
          {/if}
        {/snippet}
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
  {/if}
</Screen>

<style>
  .box {
    align-items: center;
    display: inline-grid;
    isolation: isolate;
    position: relative;
  }

  .box::before {
    background: var(--surface);
    border: 1px solid var(--control-line);
    border-radius: 8px;
    content: '';
    inset: 10px 0;
    position: absolute;
    z-index: -1;
  }

  .box:has(input:focus-visible)::before {
    outline: var(--focus-width) solid var(--focus);
    outline-offset: 2px;
  }

  .box input {
    background: transparent;
    border: 0;
    font-size: 0.8125rem;
    padding: 0 10px;
    width: 11rem;
  }

  .box input:focus-visible {
    outline: none;
  }

  /* Mobile browsers zoom the page into a focused field drawn under 16 px. */
  @media (pointer: coarse) {
    .box input {
      font-size: max(16px, 0.8125rem);
    }
  }

  .hint {
    flex: 1 0 100%;
    margin-block: -6px 6px;
  }

  [data-part='setting-control'].steps {
    flex: 1 1 12rem;
    justify-content: flex-end;
    padding-block: 4px;
    text-align: end;
  }

  .intro,
  .copyright {
    margin: 0 0 4px;
  }

  .field {
    align-items: flex-start;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-block: 6px;
  }

  .field .box,
  .field .box input {
    width: 100%;
  }

  .problem {
    color: var(--danger);
    font-weight: 600;
    margin: 0;
  }

  .link {
    font-weight: 600;
    text-underline-offset: 2px;
  }

  [role='status'] {
    margin: 0;
  }
</style>
