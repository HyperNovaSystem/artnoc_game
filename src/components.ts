import { defineComponent, Types, defineEvent, defineResource } from '@nova/core';
import type { ResourceToken, EventToken } from '@nova/core';

// ─── Core Transform ───

export const Position = defineComponent('Position', {
  x: Types.f32,
  y: Types.f32,
});

export const Velocity = defineComponent('Velocity', {
  x: Types.f32,
  y: Types.f32,
});

// ─── Player ───

/** Player state flags encoded as u8:
 *  state: 0=idle, 1=running, 2=jumping, 3=falling, 4=prone, 5=dying
 *  aimDir: 0=right, 1=upRight, 2=up, 3=upLeft, 4=left, 5=downLeft, 6=down, 7=downRight
 */
export const Player = defineComponent('Player', {
  lives: Types.u8,
  /** Weapon type: 0=rifle, 1=spread, 2=laser, 3=machineGun, 4=fireball */
  weapon: Types.u8,
  /** Aim direction (8-way) */
  aimDir: Types.u8,
  /** Facing: 0=right, 1=left */
  facing: Types.u8,
  /** Invincibility timer after respawn (seconds) */
  invTimer: Types.f32,
  /** Player state enum */
  state: Types.u8,
  /** 1 = on ground, 0 = in air */
  onGround: Types.u8,
  /** Fire cooldown timer */
  fireCooldown: Types.f32,
});

// ─── Enemy ───

/** Enemy types:
 *  0=soldier (runs, shoots)
 *  1=runner (charges at player)
 *  2=turret (stationary, shoots)
 *  3=sniper (stays still, aims at player)
 *  4=boss
 */
export const Enemy = defineComponent('Enemy', {
  enemyType: Types.u8,
  /** AI state: 0=idle, 1=patrol, 2=attack, 3=chase */
  aiState: Types.u8,
  /** AI timer for state transitions */
  aiTimer: Types.f32,
  /** Facing: 0=right, 1=left */
  facing: Types.u8,
  /** Fire cooldown */
  fireCooldown: Types.f32,
});

// ─── Projectile ───

export const Projectile = defineComponent('Projectile', {
  damage: Types.f32,
  /** 0=player bullet, 1=enemy bullet */
  ownerType: Types.u8,
  /** Normalized direction */
  dirX: Types.f32,
  dirY: Types.f32,
  speed: Types.f32,
  /** Lifetime remaining (seconds) */
  lifetime: Types.f32,
});

// ─── Collider (AABB) ───

export const Collider = defineComponent('Collider', {
  width: Types.f32,
  height: Types.f32,
  /** Offset from Position for centering */
  offsetX: Types.f32,
  offsetY: Types.f32,
});

// ─── Platform ───

/** Platform types: 0=solid, 1=one-way (can jump through from below) */
export const Platform = defineComponent('Platform', {
  platType: Types.u8,
  /** Platform width in pixels */
  width: Types.f32,
  /** Platform height in pixels */
  height: Types.f32,
});

// ─── PowerUp ───

/** PowerUp types: 0=spread, 1=laser, 2=machineGun, 3=fireball, 4=barrier, 5=extraLife */
export const PowerUp = defineComponent('PowerUp', {
  powerType: Types.u8,
});

// ─── Sprite / Animation ───

/** Sprite rendering info.
 *  spriteType maps to the visual representation:
 *    0=player, 1=soldier, 2=runner, 3=turret, 4=sniper, 5=boss,
 *    6=bullet_small, 7=bullet_spread, 8=bullet_laser, 9=bullet_fire,
 *    10=explosion, 11=powerup_capsule, 12=platform
 */
export const Sprite = defineComponent('Sprite', {
  spriteType: Types.u8,
  frame: Types.u8,
  animTimer: Types.f32,
  /** 0=normal, 1=flip horizontal */
  flipX: Types.u8,
  /** Color tint packed as 0xRRGGBB */
  color: Types.u32,
});

// ─── Gravity ───

export const GravityFlag = defineComponent('GravityFlag', {});

// ─── Tag Components ───

export const Dead = defineComponent('Dead', {});

// ─── Explosion (visual effect) ───

export const Explosion = defineComponent('Explosion', {
  timer: Types.f32,
  radius: Types.f32,
});

// ─── Resources ───

export interface InputData {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  jumpPressed: boolean;
  shoot: boolean;
  start: boolean;
}

export const InputState: ResourceToken<InputData> = defineResource<InputData>('InputState');

export interface GameStateData {
  score: number;
  lives: number;
  phase: 'title' | 'playing' | 'dying' | 'gameover' | 'victory';
  /** Timer used for death animation / respawn delay */
  phaseTimer: number;
  /** Current level index */
  level: number;
  /** How far the camera has scrolled (pixels) */
  scrollX: number;
  /** Max scroll the player has reached (no going back) */
  maxScrollX: number;
  /** Level width in pixels */
  levelWidth: number;
  /** The player entity ID */
  playerEntity: number;
  /** Number of enemies killed */
  enemiesKilled: number;
  /** Spawn tracker: index of next spawn trigger to activate */
  nextSpawnIndex: number;
}

export const GameState: ResourceToken<GameStateData> = defineResource<GameStateData>('GameState');

// ─── Events ───

export interface PlayerDeathData {
  x: number;
  y: number;
}
export const PlayerDeath: EventToken<PlayerDeathData> = defineEvent<PlayerDeathData>('PlayerDeath');

export interface EnemyKilledData {
  entity: number;
  enemyType: number;
  x: number;
  y: number;
}
export const EnemyKilled: EventToken<EnemyKilledData> = defineEvent<EnemyKilledData>('EnemyKilled');

export interface PowerUpCollectedData {
  powerType: number;
}
export const PowerUpCollected: EventToken<PowerUpCollectedData> = defineEvent<PowerUpCollectedData>('PowerUpCollected');

// ─── Constants ───

export const SCREEN_W = 768;
export const SCREEN_H = 432;
export const TILE = 24;
export const GRAVITY = 980;
export const PLAYER_SPEED = 180;
export const PLAYER_JUMP = -420;
export const PLAYER_W = 16;
export const PLAYER_H = 32;
export const PLAYER_PRONE_H = 16;

// Weapon definitions
export interface WeaponDef {
  name: string;
  fireRate: number; // seconds between shots
  speed: number;    // bullet speed
  damage: number;
  count: number;    // bullets per shot
  spread: number;   // angle spread in radians (0 = straight)
  color: number;
  spriteType: number;
}

export const WEAPON_DEFS: WeaponDef[] = [
  { name: 'Rifle',      fireRate: 0.25, speed: 600, damage: 1, count: 1, spread: 0,          color: 0xFFFFFF, spriteType: 6 },
  { name: 'Spread',     fireRate: 0.35, speed: 500, damage: 1, count: 5, spread: Math.PI / 8, color: 0xFF8844, spriteType: 7 },
  { name: 'Laser',      fireRate: 0.12, speed: 900, damage: 1, count: 1, spread: 0,          color: 0x44AAFF, spriteType: 8 },
  { name: 'Machine Gun', fireRate: 0.08, speed: 700, damage: 1, count: 1, spread: 0.05,       color: 0xFFFF44, spriteType: 6 },
  { name: 'Fireball',   fireRate: 0.30, speed: 400, damage: 3, count: 1, spread: 0,          color: 0xFF4400, spriteType: 9 },
];

// Enemy definitions
export interface EnemyDef {
  name: string;
  health: number;
  speed: number;
  color: number;
  width: number;
  height: number;
  score: number;
  fireRate: number;
}

export const ENEMY_DEFS: EnemyDef[] = [
  { name: 'Soldier', health: 1, speed: 60,  color: 0xCC4444, width: 14, height: 30, score: 100, fireRate: 2.0 },
  { name: 'Runner',  health: 1, speed: 150, color: 0xCCCC44, width: 14, height: 28, score: 150, fireRate: 0 },
  { name: 'Turret',  health: 3, speed: 0,   color: 0x888888, width: 20, height: 20, score: 200, fireRate: 1.5 },
  { name: 'Sniper',  health: 2, speed: 0,   color: 0x44CC44, width: 14, height: 30, score: 300, fireRate: 3.0 },
  { name: 'Boss',    health: 50, speed: 30, color: 0xFF2222, width: 48, height: 48, score: 5000, fireRate: 0.8 },
];

// Aim direction vectors (8-way)
export const AIM_DIRS: { x: number; y: number }[] = [
  { x: 1, y: 0 },     // 0: right
  { x: 0.707, y: -0.707 }, // 1: up-right
  { x: 0, y: -1 },    // 2: up
  { x: -0.707, y: -0.707 }, // 3: up-left
  { x: -1, y: 0 },    // 4: left
  { x: -0.707, y: 0.707 }, // 5: down-left
  { x: 0, y: 1 },     // 6: down
  { x: 0.707, y: 0.707 }, // 7: down-right
];
