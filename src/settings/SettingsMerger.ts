// Provides deterministic Settings merge scaffolding.
import type { CustomSettings, Settings, SettingsValue } from './Settings.js';
import { emptySettings } from './Settings.js';

export const mergeSettingsStack = (settingsStack: readonly Settings[]): Settings => {
  let defaultProfile: string | undefined;
  let profileSources: Settings['profileSources'];
  let remoteSettings: Settings['remoteSettings'];
  let cacheDirectory: string | undefined;
  let customSettings: CustomSettings | undefined;

  for (const settings of settingsStack) {
    defaultProfile = settings.defaultProfile ?? defaultProfile;

    if (settings.profileSources !== undefined) {
      profileSources = settings.profileSources;
    }

    if (settings.remoteSettings !== undefined) {
      remoteSettings = settings.remoteSettings;
    }

    cacheDirectory = settings.cacheDirectory ?? cacheDirectory;

    if (settings.customSettings !== undefined) {
      customSettings = mergeCustomSettings(customSettings, settings.customSettings);
    }
  }

  return {
    ...emptySettings(),
    defaultProfile,
    profileSources: profileSources ?? [],
    remoteSettings: remoteSettings ?? [],
    cacheDirectory,
    customSettings: customSettings ?? {},
  };
};

const mergeCustomSettings = (
  lowerPrecedence: CustomSettings | undefined,
  higherPrecedence: CustomSettings,
): CustomSettings => mergeSettingsValue(lowerPrecedence ?? {}, higherPrecedence);

const mergeSettingsValue = (lowerPrecedence: CustomSettings, higherPrecedence: CustomSettings): CustomSettings => ({
  ...lowerPrecedence,
  ...Object.fromEntries(
    Object.entries(higherPrecedence).map(([key, value]) => [
      key,
      key in lowerPrecedence ? mergeSettingsMember(lowerPrecedence[key], value) : value,
    ]),
  ),
});

const mergeSettingsMember = (lowerPrecedence: SettingsValue, higherPrecedence: SettingsValue): SettingsValue => {
  if (isPlainSettingsObject(lowerPrecedence) && isPlainSettingsObject(higherPrecedence)) {
    return mergeSettingsValue(lowerPrecedence, higherPrecedence);
  }

  return higherPrecedence;
};

const isPlainSettingsObject = (value: SettingsValue): value is CustomSettings =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
