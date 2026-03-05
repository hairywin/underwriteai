import { DEFAULT_OPENAI_MODEL } from "../config";
import type { Settings } from "../types";

const SETTINGS_KEY = "underwriteai_settings_v3";

export const defaultSettings: Settings = {
  openaiApiKey: "",
  rentcastApiKey: "",
  fredApiKey: "",
  censusApiKey: "",
  defaultModel: DEFAULT_OPENAI_MODEL,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearSettings() {
  localStorage.removeItem(SETTINGS_KEY);
}
