// Autosave in localStorage: cash, story progress, position, health.
// The game saves when a mission ends, when the player pauses, and on a
// slow timer while roaming. A corrupt or missing save just starts fresh.

const SAVE_KEY = 'solmar-save-v1';
export const SAVE_VERSION = 1;

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    // A save from another version of the game is not trusted: the
    // world layout may have changed under it.
    if (data.version !== SAVE_VERSION) return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function writeSave(data) {
  try {
    const payload = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      cash: data.cash | 0,
      missionsDone: data.missionsDone | 0,
      health: data.health | 0,
      playerX: data.playerX,
      playerZ: data.playerZ,
      playerHeading: data.playerHeading,
      collectedPickups: data.collectedPickups || [],
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (err) {}
}
