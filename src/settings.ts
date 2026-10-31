// The player's choices, on this device.
export interface Settings {
  musicOn: boolean;
  music: number; // 0 to 1
  sounds: number; // 0 to 1
  tilt: number; // 0 needs a big tilt for full force, 1 a small one
}

const STORAGE_KEY = 'marble-settings';
const DEFAULTS: Settings = { musicOn: true, music: 0.6, sounds: 1, tilt: 0.5 };

export function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULTS, ...(JSON.parse(saved) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable; the choice still holds for this session.
  }
}
