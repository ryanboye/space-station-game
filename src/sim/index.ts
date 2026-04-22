// Public sim API surface. Keep this list small + intentional — when a
// renamed/moved internal breaks this barrel, we want a compile error
// in the shared-API consumer (main.ts, save.ts siblings stay on
// ./sim for internal dependencies).
//
// This is *not* a dump of every sim.ts export. Only symbols that
// main.ts — the sole app consumer — pulls today. If a new consumer
// (harness, alt renderer) needs more, add explicitly.

export {
  buyMaterialsDetailed,
  buyRawFoodDetailed,
  canExpandDirection,
  clearBodies,
  createInitialState,
  expandMap,
  fireCrew,
  getCrewPriorityPresetWeights,
  getDockByTile,
  getHousingInspectorAt,
  getNextExpansionCost,
  getResidentInspectorById,
  getRoomDiagnosticAt,
  getRoomInspectorAt,
  getUnlockTier,
  getVisitorInspectorById,
  hireCrew,
  isModuleUnlocked,
  isRoomUnlocked,
  isShipTypeUnlocked,
  removeModuleAtTile,
  sellMaterials,
  sellRawFood,
  setCrewPriorityPreset,
  setCrewPriorityWeight,
  setDockAllowedShipSize,
  setDockAllowedShipType,
  setDockFacing,
  setDockPurpose,
  setModule,
  setRoom,
  setRoomHousingPolicy,
  setTile,
  setZone,
  tick,
  tryPlaceModule,
  trySetTile,
  validateDockPlacement
} from './sim';
