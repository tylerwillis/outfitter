// Tests pi launch-plan preparation: Outfitter header branding plus login/skill prefill injection.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { AgentLaunchPlan } from '../../src/agents/AgentAdapter.js';
import { preparePiLoginLaunchPlan } from '../../src/cli/commands/PiLoginLaunch.js';

const temporaryRoots: string[] = [];

const createAgentDir = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'outfitter-pi-login-'));
  temporaryRoots.push(root);
  return root;
};

const createLaunchPlan = (agentDir: string, args: readonly string[] = []): AgentLaunchPlan => ({
  command: 'pi',
  args: [...args],
  env: { PI_CODING_AGENT_DIR: agentDir },
});

const extensionPaths = (plan: AgentLaunchPlan): string[] =>
  plan.args.filter((_arg, index) => plan.args[index - 1] === '--extension');

const readExtension = (plan: AgentLaunchPlan, fileName: string): string => {
  const path = extensionPaths(plan).find((candidate) => candidate.endsWith(fileName));
  if (path === undefined) {
    throw new Error(`extension ${fileName} not injected`);
  }
  return readFileSync(path, 'utf8');
};

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('preparePiLoginLaunchPlan', () => {
  it('injects the Outfitter header branding extension for interactive pi launches', () => {
    const agentDir = createAgentDir();
    const plan = preparePiLoginLaunchPlan({
      adapterId: 'pi',
      homeDirectory: agentDir,
      launchPlan: createLaunchPlan(agentDir),
      writeLine: () => undefined,
    });

    const header = readExtension(plan, 'outfitter-extension.js');
    expect(header).toContain('pi.on("resources_discover"');
    expect(header).toContain('skillPaths: [outfitterSkillPath]');
    expect(header).toContain('/skills/outfitter/SKILL.md');
    expect(header).toContain('const openLogin = false;');
    expect(header).toContain('ctx.ui.setHeader');
    expect(header).toContain(
      'Outfitter + Pi can explain its own features and look up its docs. Ask it how to use or extend Pi or outfitter profiles.',
    );
    expect(header).toContain('Run /outfitter inside Pi at any time to customize your profile.');
    // Guards against running outside the interactive TUI.
    expect(header).toContain('if (ctx.mode !== "tui") return;');
  });

  it('does not brand non-interactive pi launches', () => {
    const agentDir = createAgentDir();
    const plan = preparePiLoginLaunchPlan({
      adapterId: 'pi',
      homeDirectory: agentDir,
      launchPlan: createLaunchPlan(agentDir, ['--print', 'hello']),
      writeLine: () => undefined,
    });

    expect(extensionPaths(plan)).toHaveLength(0);
  });

  it('leaves non-pi launch plans untouched', () => {
    const agentDir = createAgentDir();
    const original = createLaunchPlan(agentDir);
    const plan = preparePiLoginLaunchPlan({
      adapterId: 'claude',
      homeDirectory: agentDir,
      launchPlan: original,
      writeLine: () => undefined,
    });

    expect(plan).toBe(original);
  });

  it('brands and auto-opens login together on first run when pi is not logged in', () => {
    const agentDir = createAgentDir();
    const messages: string[] = [];
    const plan = preparePiLoginLaunchPlan({
      adapterId: 'pi',
      homeDirectory: agentDir,
      launchPlan: createLaunchPlan(agentDir),
      setupResult: { welcomeResult: { answered: true } } as never,
      writeLine: (message) => messages.push(message),
    });

    expect(() => readExtension(plan, 'outfitter-extension.js')).not.toThrow();
    const extension = readExtension(plan, 'outfitter-extension.js');
    expect(extension).toContain('const openLogin = true;');
    expect(extension).toContain('const openOutfitterAfterLogin = false;');
    expect(extension).toContain('setEditorText(command)');
    expect(extension).toContain('submitCommand(ctx, "/login")');
    expect(messages.some((message) => message.includes('/login'))).toBe(true);
  });

  it('uses one extension to open login before outfitter after a declined welcome', () => {
    const agentDir = createAgentDir();
    const messages: string[] = [];
    const plan = preparePiLoginLaunchPlan({
      adapterId: 'pi',
      homeDirectory: agentDir,
      launchPlan: createLaunchPlan(agentDir),
      setupResult: { welcomeResult: { answered: false } } as never,
      writeLine: (message) => messages.push(message),
    });

    expect(extensionPaths(plan)).toHaveLength(1);
    const extension = readExtension(plan, 'outfitter-extension.js');
    expect(extension).toContain('ctx.ui.setHeader');
    expect(extension).toContain('const openLogin = true;');
    expect(extension).toContain('const openOutfitterAfterLogin = true;');
    expect(extension).toContain('submitCommand(ctx, "/login")');
    expect(extension).toContain('waitForProvider(ctx)');
    expect(extension).toContain('submitCommand(ctx, "/outfitter")');
    expect(messages.some((message) => message.includes('/login'))).toBe(true);
  });
});
