import { SCREEN_H, TILE } from './components.js';

// ─── Level Data Types ───

export interface PlatformData {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0=solid, 1=one-way */
  type: number;
}

export interface SpawnTrigger {
  /** Camera scrollX that activates this spawn */
  scrollX: number;
  enemies: {
    type: number; // enemy type index
    x: number;
    y: number;
  }[];
}

export interface PowerUpSpawn {
  scrollX: number;
  x: number;
  y: number;
  powerType: number;
}

export interface LevelData {
  width: number;
  platforms: PlatformData[];
  spawns: SpawnTrigger[];
  powerUps: PowerUpSpawn[];
  playerStartX: number;
  playerStartY: number;
  bossScrollX: number;
}

// ─── Level 1: Jungle ───

const GROUND_Y = SCREEN_H - TILE;
const MID_Y = SCREEN_H - TILE * 5;
const HIGH_Y = SCREEN_H - TILE * 9;

export function createLevel1(): LevelData {
  const levelWidth = TILE * 200; // ~4800px, ~6 screens wide
  const platforms: PlatformData[] = [];

  // Ground segments with gaps
  // Segment 1: solid ground start
  platforms.push({ x: 0, y: GROUND_Y, w: TILE * 30, h: TILE, type: 0 });

  // Mid-level platforms near start
  platforms.push({ x: TILE * 8, y: MID_Y, w: TILE * 4, h: TILE / 2, type: 1 });
  platforms.push({ x: TILE * 14, y: HIGH_Y, w: TILE * 3, h: TILE / 2, type: 1 });
  platforms.push({ x: TILE * 20, y: MID_Y, w: TILE * 4, h: TILE / 2, type: 1 });

  // Gap 1
  // Segment 2
  platforms.push({ x: TILE * 33, y: GROUND_Y, w: TILE * 25, h: TILE, type: 0 });
  platforms.push({ x: TILE * 36, y: MID_Y, w: TILE * 3, h: TILE / 2, type: 1 });
  platforms.push({ x: TILE * 42, y: HIGH_Y, w: TILE * 4, h: TILE / 2, type: 1 });
  platforms.push({ x: TILE * 48, y: MID_Y, w: TILE * 5, h: TILE / 2, type: 1 });

  // Gap 2
  // Segment 3 - bridge section (narrow platforms over pit)
  platforms.push({ x: TILE * 60, y: GROUND_Y, w: TILE * 3, h: TILE, type: 0 });
  platforms.push({ x: TILE * 65, y: GROUND_Y - TILE, w: TILE * 2, h: TILE / 2, type: 1 });
  platforms.push({ x: TILE * 69, y: GROUND_Y - TILE * 2, w: TILE * 2, h: TILE / 2, type: 1 });
  platforms.push({ x: TILE * 73, y: GROUND_Y - TILE, w: TILE * 2, h: TILE / 2, type: 1 });
  platforms.push({ x: TILE * 77, y: GROUND_Y, w: TILE * 3, h: TILE, type: 0 });

  // Segment 4 - fortification area
  platforms.push({ x: TILE * 82, y: GROUND_Y, w: TILE * 35, h: TILE, type: 0 });
  // Stacked platforms (fort-like)
  platforms.push({ x: TILE * 88, y: MID_Y, w: TILE * 6, h: TILE / 2, type: 0 });
  platforms.push({ x: TILE * 96, y: MID_Y + TILE * 2, w: TILE * 4, h: TILE / 2, type: 1 });
  platforms.push({ x: TILE * 100, y: HIGH_Y, w: TILE * 5, h: TILE / 2, type: 1 });
  platforms.push({ x: TILE * 108, y: MID_Y, w: TILE * 4, h: TILE / 2, type: 1 });

  // Segment 5 - final approach
  platforms.push({ x: TILE * 120, y: GROUND_Y, w: TILE * 20, h: TILE, type: 0 });
  platforms.push({ x: TILE * 125, y: MID_Y, w: TILE * 3, h: TILE / 2, type: 1 });
  platforms.push({ x: TILE * 130, y: HIGH_Y, w: TILE * 4, h: TILE / 2, type: 1 });

  // Segment 6 - boss arena
  platforms.push({ x: TILE * 143, y: GROUND_Y, w: TILE * 30, h: TILE, type: 0 });
  platforms.push({ x: TILE * 150, y: MID_Y, w: TILE * 5, h: TILE / 2, type: 1 });
  platforms.push({ x: TILE * 160, y: MID_Y, w: TILE * 5, h: TILE / 2, type: 1 });

  // Wall at far end (boss area boundary)
  platforms.push({ x: TILE * 172, y: GROUND_Y - TILE * 15, w: TILE, h: TILE * 15, type: 0 });

  // ─── Enemy Spawns (triggered by scroll position) ───
  const spawns: SpawnTrigger[] = [
    // Early soldiers
    {
      scrollX: 0,
      enemies: [
        { type: 0, x: TILE * 15, y: GROUND_Y - 32 },
        { type: 0, x: TILE * 22, y: GROUND_Y - 32 },
      ],
    },
    {
      scrollX: TILE * 10,
      enemies: [
        { type: 0, x: TILE * 28, y: GROUND_Y - 32 },
        { type: 1, x: TILE * 25, y: GROUND_Y - 30 },
      ],
    },
    // Segment 2 enemies
    {
      scrollX: TILE * 20,
      enemies: [
        { type: 2, x: TILE * 40, y: GROUND_Y - 22 }, // turret
        { type: 0, x: TILE * 45, y: GROUND_Y - 32 },
        { type: 0, x: TILE * 50, y: GROUND_Y - 32 },
      ],
    },
    {
      scrollX: TILE * 30,
      enemies: [
        { type: 1, x: TILE * 52, y: GROUND_Y - 30 },
        { type: 3, x: TILE * 48, y: MID_Y - 32 }, // sniper on platform
      ],
    },
    // Bridge enemies
    {
      scrollX: TILE * 45,
      enemies: [
        { type: 0, x: TILE * 70, y: GROUND_Y - TILE * 2 - 30 },
        { type: 1, x: TILE * 75, y: GROUND_Y - 30 },
      ],
    },
    // Fort enemies
    {
      scrollX: TILE * 60,
      enemies: [
        { type: 2, x: TILE * 90, y: MID_Y - 22 },
        { type: 0, x: TILE * 95, y: GROUND_Y - 32 },
        { type: 3, x: TILE * 102, y: HIGH_Y - 32 },
        { type: 0, x: TILE * 105, y: GROUND_Y - 32 },
      ],
    },
    {
      scrollX: TILE * 75,
      enemies: [
        { type: 1, x: TILE * 110, y: GROUND_Y - 30 },
        { type: 2, x: TILE * 112, y: GROUND_Y - 22 },
        { type: 0, x: TILE * 115, y: GROUND_Y - 32 },
      ],
    },
    // Final approach
    {
      scrollX: TILE * 95,
      enemies: [
        { type: 0, x: TILE * 128, y: GROUND_Y - 32 },
        { type: 3, x: TILE * 132, y: HIGH_Y - 32 },
        { type: 1, x: TILE * 135, y: GROUND_Y - 30 },
        { type: 0, x: TILE * 138, y: GROUND_Y - 32 },
      ],
    },
    // Boss area guards
    {
      scrollX: TILE * 115,
      enemies: [
        { type: 2, x: TILE * 148, y: GROUND_Y - 22 },
        { type: 0, x: TILE * 152, y: GROUND_Y - 32 },
        { type: 0, x: TILE * 155, y: MID_Y - 32 },
      ],
    },
    // Boss
    {
      scrollX: TILE * 130,
      enemies: [
        { type: 4, x: TILE * 165, y: GROUND_Y - 50 },
      ],
    },
  ];

  // ─── Power-Up Spawns ───
  const powerUps: PowerUpSpawn[] = [
    { scrollX: TILE * 5, x: TILE * 12, y: HIGH_Y - 24, powerType: 0 },     // spread
    { scrollX: TILE * 35, x: TILE * 46, y: MID_Y - 24, powerType: 2 },     // machine gun
    { scrollX: TILE * 55, x: TILE * 72, y: GROUND_Y - TILE * 3 - 24, powerType: 1 }, // laser
    { scrollX: TILE * 80, x: TILE * 107, y: HIGH_Y - 24, powerType: 4 },   // barrier
    { scrollX: TILE * 100, x: TILE * 133, y: MID_Y - 24, powerType: 3 },   // fireball
    { scrollX: TILE * 110, x: TILE * 140, y: GROUND_Y - 24, powerType: 5 }, // extra life
  ];

  return {
    width: levelWidth,
    platforms,
    spawns,
    powerUps,
    playerStartX: TILE * 3,
    playerStartY: GROUND_Y - PLAYER_START_OFFSET,
    bossScrollX: TILE * 130,
  };
}

const PLAYER_START_OFFSET = 34;
