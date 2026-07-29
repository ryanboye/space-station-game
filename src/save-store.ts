export type SaveStorageScope = 'player' | 'qa';

export type LocalSaveRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  payloadText: string;
};

export type SaveStore = {
  storeVersion: 1;
  saves: LocalSaveRecord[];
};

export type SaveStorageKeys = {
  storeKey: string;
  autosaveKey: string;
  quicksaveId: string;
};

export const MAX_SAVE_SLOTS = 30;
export const MAX_SAVE_STORE_CHARS = 3_500_000;

const STORAGE_KEYS: Record<SaveStorageScope, SaveStorageKeys> = {
  player: {
    storeKey: 'stationSim.saves.v1',
    autosaveKey: 'spacegame-autosave',
    quicksaveId: 'quicksave'
  },
  qa: {
    storeKey: 'stationSim.qaSaves.v1',
    autosaveKey: 'spacegame-qa-autosave',
    quicksaveId: 'quicksave'
  }
};

export function saveStorageKeys(scope: SaveStorageScope): SaveStorageKeys {
  return STORAGE_KEYS[scope];
}

/**
 * Scenario and repro URLs are deterministic workspaces, not player sessions.
 * Their persistence is deliberately isolated even when a harness loads a
 * normal-looking save payload.
 */
export function saveStorageScopeFromSearchParams(params: Pick<URLSearchParams, 'has'>): SaveStorageScope {
  return params.has('scenario') || params.has('load') || params.has('loadId') ? 'qa' : 'player';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSaveStore(raw: string | null): { store: SaveStore; invalid: boolean } {
  const fallback: SaveStore = { storeVersion: 1, saves: [] };
  if (!raw) return { store: fallback, invalid: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { store: fallback, invalid: true };
  }
  if (!isRecord(parsed) || parsed.storeVersion !== 1 || !Array.isArray(parsed.saves)) {
    return { store: fallback, invalid: true };
  }

  const saves: LocalSaveRecord[] = [];
  for (const entry of parsed.saves) {
    if (!isRecord(entry)) continue;
    if (
      typeof entry.id !== 'string' ||
      typeof entry.name !== 'string' ||
      typeof entry.createdAt !== 'string' ||
      typeof entry.updatedAt !== 'string' ||
      typeof entry.payloadText !== 'string'
    ) {
      continue;
    }
    saves.push({
      id: entry.id,
      name: entry.name,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      payloadText: entry.payloadText
    });
  }
  return { store: { storeVersion: 1, saves }, invalid: false };
}

export function sortSavesForUi(saves: LocalSaveRecord[], quicksaveId = 'quicksave'): LocalSaveRecord[] {
  return [...saves].sort((a, b) => {
    if (a.id === quicksaveId && b.id !== quicksaveId) return -1;
    if (a.id !== quicksaveId && b.id === quicksaveId) return 1;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

export function trimSaveStore(
  saves: LocalSaveRecord[],
  protectedSaveId?: string,
  limits: { maxSlots?: number; maxChars?: number } = {}
): { saves: LocalSaveRecord[]; removed: number } {
  const maxSlots = limits.maxSlots ?? MAX_SAVE_SLOTS;
  const maxChars = limits.maxChars ?? MAX_SAVE_STORE_CHARS;
  const ranked = [...saves].sort((a, b) => {
    if (a.id === protectedSaveId && b.id !== protectedSaveId) return -1;
    if (a.id !== protectedSaveId && b.id === protectedSaveId) return 1;
    if (a.id === 'quicksave' && b.id !== 'quicksave') return -1;
    if (a.id !== 'quicksave' && b.id === 'quicksave') return 1;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
  const kept: LocalSaveRecord[] = [];
  for (const save of ranked) {
    if (kept.length >= maxSlots) continue;
    const candidate = [...kept, save];
    const candidateChars = JSON.stringify({ storeVersion: 1, saves: candidate }).length;
    if (candidateChars <= maxChars || save.id === protectedSaveId) kept.push(save);
  }
  return { saves: kept, removed: saves.length - kept.length };
}

/** Only player-owned saves may participate in title-screen Continue. */
export function continueEligibleSaves(scope: SaveStorageScope, saves: LocalSaveRecord[]): LocalSaveRecord[] {
  if (scope !== 'player') return [];
  return [...saves].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
