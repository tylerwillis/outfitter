// Tests Bridl-time template rendering for generated tack files.
import { describe, expect, it } from 'vitest';

import { createTack } from '../../src/tack/Tack.js';
import { createTackFile } from '../../src/tack/TackFile.js';
import { renderTackTemplates } from '../../src/tack/TackTemplate.js';

describe('tack template rendering', () => {
  it('renders Bridl tack templates with custom delimiters and leaves common shell conditionals alone', () => {
    const tack = createTack('/tmp/bridl-template-test', [
      createTackFile({
        relativePath: 'settings.yml',
        content: [
          'lint: "[[= bridl.custom_settings.build_commands.lint ]]"',
          'commands:',
          '[[% for command in bridl.custom_settings.commands %]]',
          '  - "[[= command ]]"',
          '[[% endfor %]]',
          'shell: "[[ -f package.json ]]"',
          '',
        ].join('\n'),
        sourceInputs: ['/profiles/default/profile.yml'],
      }),
    ]);

    const rendered = renderTackTemplates({
      tack,
      settings: {
        customSettings: {
          build_commands: { lint: 'npm run lint' },
          commands: ['npm test', 'npm run build'],
        },
      },
      settingsPaths: ['/home/example/.bridl/settings.yml'],
      profile: { id: 'default', inherits: [], controls: {} },
      agentId: 'pi',
      projectDirectory: '/work/project',
    });

    expect(rendered.files[0]?.content).toContain('lint: "npm run lint"');
    expect(rendered.files[0]?.content).toContain('  - "npm test"');
    expect(rendered.files[0]?.content).toContain('  - "npm run build"');
    expect(rendered.files[0]?.content).toContain('shell: "[[ -f package.json ]]"');
    expect(rendered.files[0]?.sourceInputs).toEqual([
      '/profiles/default/profile.yml',
      '/home/example/.bridl/settings.yml',
    ]);
    expect(() =>
      renderTackTemplates({
        tack: createTack('/tmp/bridl-template-test', [
          createTackFile({ relativePath: 'bad.yml', content: 'missing: [[= bridl.custom_settings.missing ]]\n' }),
        ]),
        settings: { customSettings: {} },
        settingsPaths: [],
        profile: { id: 'default', inherits: [], controls: {} },
        agentId: 'pi',
        projectDirectory: '/work/project',
      }),
    ).toThrow("Cannot render Bridl template in tack file 'bad.yml'");
  });

  it('renders built-in context when no custom settings are defined', () => {
    const rendered = renderTackTemplates({
      tack: createTack('/tmp/bridl-template-test', [
        createTackFile({ relativePath: 'agent.txt', content: 'agent=[[= bridl.agent ]]\n' }),
      ]),
      settings: {},
      settingsPaths: [],
      profile: { id: 'default', inherits: [], controls: {} },
      agentId: 'pi',
      projectDirectory: '/work/project',
    });

    expect(rendered.files[0]?.content).toBe('agent=pi\n');
  });
});
