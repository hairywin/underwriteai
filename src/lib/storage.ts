import type { Settings } from "../types";

const SETTINGS_KEY = "underwriteai_settings_v1";

export const defaultSettings: Settings = {
  openaiApiKey: "",
  rentcastApiKey: "",
  enableWebSearch: false,
  searchApiKey: "",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function clearSettings() {
  localStorage.removeItem(SETTINGS_KEY);
}
