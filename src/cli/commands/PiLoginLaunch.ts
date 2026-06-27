// Adds first-run Pi login startup behavior without handling credentials in Outfitter.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AgentLaunchPlan } from '../../agents/AgentAdapter.js';
import type { SetupCommandResult } from './SetupCommand.js';

export interface PiLoginLaunchPlanInput {
  readonly adapterId: string;
  readonly homeDirectory: string;
  readonly launchPlan: AgentLaunchPlan;
  readonly setupResult?: SetupCommandResult;
  readonly writeLine?: (message: string) => void;
}

const outfitterSkillMessage =
  'No profile set up. Outfitter will open `/outfitter` automatically so you can configure a profile.';

const manualLoginMessage =
  'Pi does not appear to be logged in yet. After Pi starts, run `/login` and choose a subscription such as Codex or provide an API key from another model provider.';

const automaticLoginMessage =
  'Pi does not appear to be logged in yet. Outfitter will open `/login` automatically after Pi starts.';

const nonInteractivePiLaunchFlags = new Set(['--print', '-p', '--mode', '--export', '--list-models']);
const packageRootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const builtInOutfitterSkill = join(packageRootDirectory, 'skills', 'outfitter', 'SKILL.md');

export const preparePiLoginLaunchPlan = (input: PiLoginLaunchPlanInput): AgentLaunchPlan => {
  if (input.adapterId !== 'pi') {
    return input.launchPlan;
  }

  let launchPlan = input.launchPlan;
  const interactiveLaunch = !isNonInteractivePiLaunch(input.launchPlan.args);
  const shouldAutoOpenLogin = shouldAutoOpenPiLogin(input.setupResult, input.launchPlan.args);
  const shouldOpenOutfitter = shouldAutoOpenOutfitterSkill(input.setupResult, input.launchPlan.args);
  const shouldOpenLogin = !hasConfiguredPiLoginState(input.homeDirectory);

  if (interactiveLaunch) {
    launchPlan = addExtension(
      launchPlan,
      'outfitter-extension.js',
      createPiOutfitterExtensionContent({
        outfitterSkillPath: builtInOutfitterSkill,
        openLogin: shouldAutoOpenLogin,
        openOutfitterAfterLogin: shouldOpenOutfitter,
      }),
    );
  }

  if (shouldOpenLogin) {
    if (shouldAutoOpenLogin) {
      writePiLoginMessage(input.writeLine, automaticLoginMessage);
      return launchPlan;
    }

    writePiLoginMessage(input.writeLine, manualLoginMessage);
    return launchPlan;
  }

  if (shouldOpenOutfitter) {
    writePiLoginMessage(input.writeLine, outfitterSkillMessage);
  }

  return launchPlan;
};

const addExtension = (launchPlan: AgentLaunchPlan, fileName: string, content: string): AgentLaunchPlan => {
  const extensionPath = join(launchPlan.env.PI_CODING_AGENT_DIR, 'outfitter', fileName);
  mkdirSync(dirname(extensionPath), { recursive: true });
  writeFileSync(extensionPath, content);

  return { ...launchPlan, args: ['--extension', extensionPath, ...launchPlan.args] };
};

interface PiOutfitterExtensionOptions {
  readonly outfitterSkillPath: string;
  readonly openLogin: boolean;
  readonly openOutfitterAfterLogin: boolean;
}

const createPiOutfitterExtensionContent = (
  options: PiOutfitterExtensionOptions,
): string => `const outfitterSkillPath = ${JSON.stringify(options.outfitterSkillPath)};
const openLogin = ${JSON.stringify(options.openLogin)};
const openOutfitterAfterLogin = ${JSON.stringify(options.openOutfitterAfterLogin)};
const loginPollIntervalMs = 500;
const loginPollTimeoutMs = 300000;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const providerIsAvailable = async (ctx) => {
  const available = await ctx.modelRegistry?.getAvailable?.();
  return Array.isArray(available) && available.length > 0;
};

const waitForProvider = async (ctx) => {
  const deadline = Date.now() + loginPollTimeoutMs;
  while (Date.now() < deadline) {
    if (await providerIsAvailable(ctx)) return true;
    await delay(loginPollIntervalMs);
  }
  return false;
};

const submitCommand = async (ctx, command) => {
  ctx.ui.setEditorText(command);
  await ctx.ui.custom((tui, _theme, _keybindings, done) => {
    setTimeout(() => {
      tui.focusedComponent?.handleInput?.("\\r");
      done();
    }, 25);

    return {
      render: () => [],
      invalidate: () => undefined,
    };
  }, { overlay: true, overlayOptions: { nonCapturing: true, visible: () => false } });
};

export default function outfitter(pi) {
  pi.on("resources_discover", () => ({
    skillPaths: [outfitterSkillPath],
  }));

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setHeader((_tui, theme) => {
      const lines = [
        theme.bold(theme.fg("accent", "Outfitter")) + theme.fg("dim", " + pi"),
        theme.fg("muted", "/ commands · ! bash · ctrl+o more"),
        "",
        theme.fg(
          "dim",
          "Outfitter + Pi can explain its own features and look up its docs. Ask it how to use or extend Pi or outfitter profiles.",
        ),
        theme.fg("dim", "Run /outfitter inside Pi at any time to customize your profile."),
      ];
      return {
        render: () => lines,
        invalidate: () => undefined,
      };
    });

    if (openLogin && !(await providerIsAvailable(ctx))) {
      ctx.ui.notify("Outfitter is opening /login so you can choose a provider.", "info");
      await submitCommand(ctx, "/login");

      if (!openOutfitterAfterLogin || !(await waitForProvider(ctx))) return;
    }

    if (openOutfitterAfterLogin) {
      ctx.ui.notify("Outfitter is opening /outfitter to help you set up your profile.", "info");
      await submitCommand(ctx, "/outfitter");
    }
  });
}
`;

const writePiLoginMessage = (writeLine: ((message: string) => void) | undefined, message: string): void => {
  /* v8 ignore next -- console fallback is direct CLI behavior; tests inject a writer for login messages. */
  (writeLine ?? console.log)(message);
};

const shouldAutoOpenOutfitterSkill = (setupResult: SetupCommandResult | undefined, args: readonly string[]): boolean =>
  setupResult?.welcomeResult?.answered === false && !isNonInteractivePiLaunch(args);

const shouldAutoOpenPiLogin = (setupResult: SetupCommandResult | undefined, args: readonly string[]): boolean =>
  setupResult?.welcomeResult !== undefined && !isNonInteractivePiLaunch(args);

const isNonInteractivePiLaunch = (args: readonly string[]): boolean =>
  args.some((arg) => nonInteractivePiLaunchFlags.has(arg));

const hasConfiguredPiLoginState = (homeDirectory: string): boolean =>
  hasConfiguredPiStateFile(homeDirectory, 'auth.json') || hasConfiguredPiStateFile(homeDirectory, 'models.json');

const hasConfiguredPiStateFile = (homeDirectory: string, fileName: string): boolean => {
  const statePath = join(homeDirectory, '.pi', 'agent', fileName);

  if (!existsSync(statePath)) {
    return false;
  }

  try {
    return hasConfiguredPiStateEntries(JSON.parse(readFileSync(statePath, 'utf8')));
  } catch {
    return false;
  }
};

const hasConfiguredPiStateEntries = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value === null || typeof value !== 'object') {
    return false;
  }

  const record = value as Readonly<Record<string, unknown>>;
  const containerKeys = ['models', 'providers', 'model_providers'];
  const presentContainers = containerKeys.filter((key) => Object.hasOwn(record, key));

  if (presentContainers.length > 0) {
    return presentContainers.some((key) => hasConfiguredPiStateEntries(record[key]));
  }

  return Object.keys(record).length > 0;
};
