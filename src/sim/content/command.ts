import { ModuleType, type SpecialtyId, type SpecialtyProgress, type StaffDepartment, type StaffRole, type StaffRoleCounts } from '../types';

export type StaffRoleDefinition = {
  id: StaffRole;
  label: string;
  department: StaffDepartment;
  cost: number;
  payroll: number;
  officer: boolean;
  requiresSpecialty: SpecialtyId | null;
  lane: 'food' | 'sanitation' | 'engineering' | 'logistics' | 'construction-eva';
  fallback: boolean;
};

export type SpecialtyDefinition = {
  id: SpecialtyId;
  label: string;
  department: StaffDepartment;
  description: string;
  unlockTier: number;
  researchSeconds: number;
  researchCost: number;
  officerRole: StaffRole;
  terminal: ModuleType;
  unlocksStaff: StaffRole[];
  unlocksModules: ModuleType[];
};

export const SURFACED_STAFF_ROLES: StaffRole[] = [
  'captain',
  'sanitation-officer',
  'security-officer',
  'mechanic-officer',
  'industrial-officer',
  'navigation-officer',
  'comms-officer',
  'medical-officer',
  'cook',
  'janitor',
  'botanist',
  'technician',
  'engineer',
  'doctor',
  'security-guard',
  'assistant'
];

export const DEFERRED_STAFF_ROLES: StaffRole[] = [
  'cleaner',
  'mechanic',
  'welder',
  'nurse',
  'eva-specialist',
  'eva-engineer',
  'flight-controller',
  'docking-officer'
];

export const STAFF_ROLES: StaffRole[] = [
  'captain',
  'sanitation-officer',
  'security-officer',
  'mechanic-officer',
  'industrial-officer',
  'navigation-officer',
  'comms-officer',
  'medical-officer',
  'cook',
  'cleaner',
  'janitor',
  'botanist',
  'technician',
  'engineer',
  'mechanic',
  'welder',
  'doctor',
  'nurse',
  'security-guard',
  'assistant',
  'eva-specialist',
  'eva-engineer',
  'flight-controller',
  'docking-officer'
];

export const OFFICER_ROLES: StaffRole[] = [
  'captain',
  'sanitation-officer',
  'security-officer',
  'mechanic-officer',
  'industrial-officer',
  'navigation-officer',
  'comms-officer',
  'medical-officer'
];

export const STAFF_ROLE_DEFINITIONS: Record<StaffRole, StaffRoleDefinition> = {
  captain: {
    id: 'captain',
    label: 'Captain',
    department: 'command',
    cost: 0,
    payroll: 0.45,
    officer: true,
    requiresSpecialty: null,
    lane: 'logistics',
    fallback: false
  },
  'sanitation-officer': {
    id: 'sanitation-officer',
    label: 'Sanitation Officer',
    department: 'sanitation',
    cost: 45,
    payroll: 0.36,
    officer: true,
    requiresSpecialty: 'sanitation-program',
    lane: 'sanitation',
    fallback: false
  },
  'security-officer': {
    id: 'security-officer',
    label: 'Security Officer',
    department: 'security',
    cost: 55,
    payroll: 0.42,
    officer: true,
    requiresSpecialty: 'security-command',
    lane: 'engineering',
    fallback: false
  },
  'mechanic-officer': {
    id: 'mechanic-officer',
    label: 'Mechanic Officer',
    department: 'mechanical',
    cost: 55,
    payroll: 0.42,
    officer: true,
    requiresSpecialty: 'mechanical-maintenance',
    lane: 'engineering',
    fallback: false
  },
  'industrial-officer': {
    id: 'industrial-officer',
    label: 'Industrial Officer',
    department: 'industrial',
    cost: 55,
    payroll: 0.42,
    officer: true,
    requiresSpecialty: 'industrial-logistics',
    lane: 'logistics',
    fallback: false
  },
  'navigation-officer': {
    id: 'navigation-officer',
    label: 'Navigation Officer',
    department: 'navigation',
    cost: 60,
    payroll: 0.42,
    officer: true,
    requiresSpecialty: 'navigation-traffic',
    lane: 'construction-eva',
    fallback: false
  },
  'comms-officer': {
    id: 'comms-officer',
    label: 'Comms Officer',
    department: 'communications',
    cost: 50,
    payroll: 0.38,
    officer: true,
    requiresSpecialty: 'communications-comms',
    lane: 'logistics',
    fallback: false
  },
  'medical-officer': {
    id: 'medical-officer',
    label: 'Medical Officer',
    department: 'medical',
    cost: 50,
    payroll: 0.38,
    officer: true,
    requiresSpecialty: 'medical-services',
    lane: 'sanitation',
    fallback: false
  },
  cook: { id: 'cook', label: 'Cook', department: 'food', cost: 16, payroll: 0.32, officer: false, requiresSpecialty: null, lane: 'food', fallback: false },
  cleaner: { id: 'cleaner', label: 'Cleaner', department: 'sanitation', cost: 14, payroll: 0.28, officer: false, requiresSpecialty: 'sanitation-program', lane: 'sanitation', fallback: true },
  janitor: { id: 'janitor', label: 'Janitor', department: 'sanitation', cost: 18, payroll: 0.3, officer: false, requiresSpecialty: 'sanitation-program', lane: 'sanitation', fallback: true },
  botanist: { id: 'botanist', label: 'Botanist', department: 'food', cost: 18, payroll: 0.32, officer: false, requiresSpecialty: null, lane: 'food', fallback: false },
  technician: { id: 'technician', label: 'Technician', department: 'mechanical', cost: 18, payroll: 0.32, officer: false, requiresSpecialty: 'mechanical-maintenance', lane: 'engineering', fallback: true },
  engineer: { id: 'engineer', label: 'Engineer', department: 'mechanical', cost: 24, payroll: 0.38, officer: false, requiresSpecialty: 'mechanical-maintenance', lane: 'engineering', fallback: true },
  mechanic: { id: 'mechanic', label: 'Mechanic', department: 'mechanical', cost: 20, payroll: 0.34, officer: false, requiresSpecialty: 'mechanical-maintenance', lane: 'engineering', fallback: true },
  welder: { id: 'welder', label: 'Welder', department: 'eva', cost: 24, payroll: 0.38, officer: false, requiresSpecialty: 'mechanical-maintenance', lane: 'construction-eva', fallback: true },
  doctor: { id: 'doctor', label: 'Doctor', department: 'medical', cost: 30, payroll: 0.42, officer: false, requiresSpecialty: 'medical-services', lane: 'sanitation', fallback: false },
  nurse: { id: 'nurse', label: 'Nurse', department: 'medical', cost: 22, payroll: 0.34, officer: false, requiresSpecialty: 'medical-services', lane: 'sanitation', fallback: true },
  'security-guard': { id: 'security-guard', label: 'Security Guard', department: 'security', cost: 22, payroll: 0.35, officer: false, requiresSpecialty: 'security-command', lane: 'engineering', fallback: true },
  assistant: { id: 'assistant', label: 'Assistant', department: 'general', cost: 12, payroll: 0.24, officer: false, requiresSpecialty: null, lane: 'logistics', fallback: true },
  'eva-specialist': { id: 'eva-specialist', label: 'EVA Specialist', department: 'eva', cost: 28, payroll: 0.44, officer: false, requiresSpecialty: 'navigation-traffic', lane: 'construction-eva', fallback: true },
  'eva-engineer': { id: 'eva-engineer', label: 'EVA Engineer', department: 'eva', cost: 32, payroll: 0.48, officer: false, requiresSpecialty: 'mechanical-maintenance', lane: 'construction-eva', fallback: true },
  'flight-controller': { id: 'flight-controller', label: 'Flight Controller', department: 'navigation', cost: 26, payroll: 0.38, officer: false, requiresSpecialty: 'navigation-traffic', lane: 'construction-eva', fallback: false },
  'docking-officer': { id: 'docking-officer', label: 'Docking Officer', department: 'navigation', cost: 24, payroll: 0.36, officer: false, requiresSpecialty: 'navigation-traffic', lane: 'construction-eva', fallback: true }
};

export const SPECIALTY_DEFINITIONS: SpecialtyDefinition[] = [
  {
    id: 'sanitation-program',
    label: 'Sanitation Program',
    department: 'sanitation',
    description: 'Unlocks dedicated cleaners, janitors, sanitation overlays, and the sanitation terminal.',
    unlockTier: 1,
    researchSeconds: 10,
    researchCost: 70,
    officerRole: 'sanitation-officer',
    terminal: ModuleType.SanitationTerminal,
    unlocksStaff: ['cleaner', 'janitor'],
    unlocksModules: [ModuleType.SanitationTerminal]
  },
  {
    id: 'security-command',
    label: 'Security Command',
    department: 'security',
    description: 'Unlocks guards, command staffing for incidents, and security console expansion.',
    unlockTier: 3,
    researchSeconds: 10,
    researchCost: 110,
    officerRole: 'security-officer',
    terminal: ModuleType.SecurityTerminal,
    unlocksStaff: ['security-guard'],
    unlocksModules: [ModuleType.SecurityTerminal]
  },
  {
    id: 'industrial-logistics',
    label: 'Industrial Logistics',
    department: 'industrial',
    description: 'Unlocks industrial officer oversight, workshop/logistics staff, and supply planning terminals.',
    unlockTier: 2,
    researchSeconds: 10,
    researchCost: 90,
    officerRole: 'industrial-officer',
    terminal: ModuleType.IndustrialTerminal,
    unlocksStaff: ['assistant'],
    unlocksModules: [ModuleType.IndustrialTerminal, ModuleType.LogisticsTerminal, ModuleType.ResourceManagementTerminal]
  },
  {
    id: 'mechanical-maintenance',
    label: 'Mechanical Maintenance',
    department: 'mechanical',
    description: 'Unlocks station mechanics, technicians, engineers, welders, and maintenance command terminals.',
    unlockTier: 2,
    researchSeconds: 10,
    researchCost: 100,
    officerRole: 'mechanic-officer',
    terminal: ModuleType.MechanicalTerminal,
    unlocksStaff: ['technician', 'engineer', 'mechanic', 'welder', 'eva-engineer'],
    unlocksModules: [ModuleType.MechanicalTerminal, ModuleType.PowerManagementTerminal, ModuleType.LifeSupportTerminal, ModuleType.AtmosphereControlTerminal]
  },
  {
    id: 'medical-services',
    label: 'Medical Services',
    department: 'medical',
    description: 'Unlocks medical officer governance, doctors, nurses, and the medical terminal.',
    unlockTier: 3,
    researchSeconds: 10,
    researchCost: 105,
    officerRole: 'medical-officer',
    terminal: ModuleType.MedicalTerminal,
    unlocksStaff: ['doctor', 'nurse'],
    unlocksModules: [ModuleType.MedicalTerminal]
  },
  {
    id: 'navigation-traffic',
    label: 'Navigation and Traffic',
    department: 'navigation',
    description: 'Unlocks flight control, docking officers, EVA specialists, and traffic/fleet terminals.',
    unlockTier: 3,
    researchSeconds: 10,
    researchCost: 120,
    officerRole: 'navigation-officer',
    terminal: ModuleType.NavigationTerminal,
    unlocksStaff: ['flight-controller', 'docking-officer', 'eva-specialist'],
    unlocksModules: [ModuleType.NavigationTerminal, ModuleType.FleetCommandTerminal, ModuleType.TrafficControlTerminal]
  },
  {
    id: 'communications-comms',
    label: 'Communications',
    department: 'communications',
    description: 'Unlocks comms officer coordination, long-range signals, and record/comms terminals.',
    unlockTier: 4,
    researchSeconds: 10,
    researchCost: 130,
    officerRole: 'comms-officer',
    terminal: ModuleType.CommsTerminal,
    unlocksStaff: ['assistant'],
    unlocksModules: [ModuleType.CommsTerminal, ModuleType.RecordsTerminal]
  },
  {
    id: 'research-archives',
    label: 'Research Archives',
    department: 'command',
    description: 'Improves specialty research throughput and unlocks research, AI, and emergency command consoles.',
    unlockTier: 4,
    researchSeconds: 10,
    researchCost: 140,
    officerRole: 'captain',
    terminal: ModuleType.ResearchTerminal,
    unlocksStaff: ['assistant'],
    unlocksModules: [ModuleType.ResearchTerminal, ModuleType.AiCoreTerminal, ModuleType.EmergencyControlTerminal]
  }
];

export const SPECIALTY_BY_ID: Record<SpecialtyId, SpecialtyDefinition> = Object.fromEntries(
  SPECIALTY_DEFINITIONS.map((def) => [def.id, def])
) as Record<SpecialtyId, SpecialtyDefinition>;

export const SPECIALTY_BRANCH_PHASE: Record<SpecialtyId, number> = {
  'sanitation-program': 0,
  'industrial-logistics': 0,
  'mechanical-maintenance': 0,
  'security-command': 1,
  'medical-services': 1,
  'navigation-traffic': 1,
  'communications-comms': 2,
  'research-archives': 2
};

export const SPECIALTY_BRANCH_COMPLETION_REQUIREMENT: Record<number, number> = {
  0: 0,
  1: 1,
  2: 3
};

export function isSpecialtyPhaseAvailable(specialtyId: SpecialtyId, completedCount: number): boolean {
  const phase = SPECIALTY_BRANCH_PHASE[specialtyId] ?? 0;
  const requiredCompleted = SPECIALTY_BRANCH_COMPLETION_REQUIREMENT[phase] ?? phase;
  return completedCount >= requiredCompleted;
}

export function createEmptyStaffRoleCounts(): StaffRoleCounts {
  return Object.fromEntries(STAFF_ROLES.map((role) => [role, 0])) as StaffRoleCounts;
}

export function createInitialStaffRoleCounts(): StaffRoleCounts {
  const counts = createEmptyStaffRoleCounts();
  counts.assistant = 4;
  return counts;
}

export function totalStaffCount(counts: Partial<Record<StaffRole, number>>): number {
  return STAFF_ROLES.reduce((sum, role) => sum + Math.max(0, Math.floor(counts[role] ?? 0)), 0);
}

export function createInitialSpecialtyProgress(): Record<SpecialtyId, SpecialtyProgress> {
  return Object.fromEntries(
    SPECIALTY_DEFINITIONS.map((def) => [
      def.id,
      { id: def.id, state: isSpecialtyPhaseAvailable(def.id, 0) ? 'available' : 'locked', progress: 0, selectedAt: null, completedAt: null }
    ])
  ) as Record<SpecialtyId, SpecialtyProgress>;
}
