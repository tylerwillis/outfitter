// Tests Outfitter's Pi keybinding reconciliation for runtime shortcut defaults.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createPiAdapter } from '../../src/agents/pi/PiAdapter.js';
import { writeCompositeProfile } from '../../src/compositeProfile/CompositeProfileAssembler.js';

const temporaryRoots: string[] = [];

const createTestHome = (): { readonly homeDirectory: string; readonly keybindingsPath: string } => {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'outfitter-pi-keybindings-'));
  temporaryRoots.push(homeDirectory);
  const agentDirectory = join(homeDirectory, '.pi', 'agent');
  mkdirSync(agentDirectory, { recursive: true });

  return { homeDirectory, keybindingsPath: join(agentDirectory, 'keybindings.json') };
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('pi keybinding reconciliation', () => {
  // THIS TEST VALIDATES A HARD REQUIREMENT (OFTR-006.7).
  // YOU MUST NOT MODIFY THIS TEST UNLESS THE REQUIREMENT CHANGES.
  it('generates runtime keybindings that reserve Shift+Tab for Outfitter mode switching', () => {
    const { homeDirectory, keybindingsPath } = createTestHome();
    writeFileSync(
      keybindingsPath,
      JSON.stringify({
        cycleThinkingLevel: ['shift+tab', 'alt+x'],
        'app.thinking.cycle': ['shift+tab', 'alt+t'],
        'app.model.select': 'shift+ctrl+t',
        'custom.mode': 'shift+tab',
      }),
    );

    const compositeProfilePlan = createPiAdapter().createCompositeProfile(
      { id: 'engineering', inherits: [], controls: {} },
      {
        rootDirectory: join(homeDirectory, 'composite'),
        profilePaths: ['/profiles/engineering/profile.yml'],
        homeDirectory,
      },
    );
    const keybindingsFile = compositeProfilePlan.compositeProfile.files.find(
      (file) => file.relativePath === 'keybindings.json',
    );

    expect(keybindingsFile?.sourceInputs).toEqual([keybindingsPath, '/profiles/engineering/profile.yml']);
    expect(JSON.parse(keybindingsFile?.content ?? '{}')).toEqual({
      'app.thinking.cycle': ['alt+x', 'alt+t', 'ctrl+shift+t'],
      'app.model.select': [],
      'custom.mode': [],
    });
    expect(
      compositeProfilePlan.compositeProfile.statePaths.find(
        (statePath) => statePath.relativePath === 'keybindings.json',
      ),
    ).toEqual({
      relativePath: 'keybindings.json',
      strategy: 'discard',
      directory: false,
    });
  });

  it('throws when native Pi keybindings JSON is malformed', () => {
    const { homeDirectory, keybindingsPath } = createTestHome();
    writeFileSync(keybindingsPath, '{not-json');

    expect(() =>
      createPiAdapter().createCompositeProfile(
        { id: 'engineering', inherits: [], controls: {} },
        {
          rootDirectory: join(homeDirectory, 'composite'),
          profilePaths: [],
          homeDirectory,
        },
      ),
    ).toThrow(`Could not parse pi keybindings file '${keybindingsPath}'`);
  });

  // THIS TEST VALIDATES A HARD REQUIREMENT (OFTR-006.7).
  // YOU MUST NOT MODIFY THIS TEST UNLESS THE REQUIREMENT CHANGES.
  it('materializes the generated keybindings without mutating native Pi keybindings', () => {
    const { homeDirectory, keybindingsPath } = createTestHome();
    writeFileSync(keybindingsPath, '{"app.thinking.cycle":"shift+tab"}\n');

    const compositeProfilePlan = createPiAdapter().createCompositeProfile(
      { id: 'engineering', inherits: [], controls: {} },
      {
        rootDirectory: join(homeDirectory, 'composite'),
        profilePaths: [],
        homeDirectory,
      },
    );

    writeCompositeProfile(compositeProfilePlan.compositeProfile);

    expect(readFileSync(keybindingsPath, 'utf8')).toBe('{"app.thinking.cycle":"shift+tab"}\n');
    expect(JSON.parse(readFileSync(join(homeDirectory, 'composite', 'keybindings.json'), 'utf8'))).toEqual({
      'app.thinking.cycle': ['ctrl+shift+t'],
    });
  });
});
