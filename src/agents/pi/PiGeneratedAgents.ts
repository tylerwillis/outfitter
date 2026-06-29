// Generates native Pi subagent definitions from Outfitter profiles.
import type { AgentLaunchProfileLayer } from '../AgentAdapter.js';
import { mergeAgentSpecificControls } from '../AdapterProfileControls.js';
import { createCompositeProfileFile } from '../../compositeProfile/CompositeProfileFile.js';
import type { PiProfileControls, Profile } from '../../profiles/Profile.js';

export const createPiGeneratedAgentFiles = (
  rootDirectory: string,
  generatedAgentProfiles: readonly AgentLaunchProfileLayer[],
): ReturnType<typeof createCompositeProfileFile>[] =>
  generatedAgentProfiles.map((profileLayer) =>
    createCompositeProfileFile({
      rootDirectory,
      relativePath: `agents/${profileLayer.profile.id}.md`,
      content: createPiGeneratedAgentMarkdown(profileLayer.profile),
      sourceInputs: profileLayer.sourceInputs ?? [profileLayer.profilePath],
      strategy: 'transform',
    }),
  );

const createPiGeneratedAgentMarkdown = (profile: Profile): string => {
  const controls = mergePiControls(profile.controls);
  const promptReferences = createPromptReferences(controls);

  return [
    '---',
    `name: ${JSON.stringify(profile.id)}`,
    ...(profile.description === undefined ? [] : [`description: ${JSON.stringify(profile.description)}`]),
    ...(controls.model === undefined ? [] : [`model: ${JSON.stringify(controls.model)}`]),
    '---',
    '',
    `You are the ${profile.label ?? profile.id} Outfitter profile running as a delegated Pi subagent.`,
    '',
    ...(promptReferences.length === 0
      ? []
      : [
          'Before starting substantive work, read and follow these Outfitter prompt files when they are present in the current project:',
          ...promptReferences.map((promptReference) => `- ${promptReference}`),
          '',
        ]),
    'Use the task provided by the parent agent as your scope. Return concise results with changed files, verification evidence, and blockers.',
    '',
  ].join('\n');
};

const createPromptReferences = (controls: PiProfileControls): readonly string[] => [
  ...toStringArray(controls.appendSystemPrompt),
  ...(controls.promptTemplate === undefined ? [] : [controls.promptTemplate]),
];

const toStringArray = (value: string | readonly string[] | undefined): readonly string[] => {
  if (value === undefined) {
    return [];
  }

  return typeof value === 'string' ? [value] : value;
};

const mergePiControls = (controls: Profile['controls']): PiProfileControls =>
  mergeAgentSpecificControls<PiProfileControls>(controls, 'pi');
