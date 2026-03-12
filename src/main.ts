import { Engine, query } from '@nova/core';
import {
  Position, Velocity, Player, Enemy, Projectile, Collider,
  Platform, PowerUp, Sprite, GravityFlag, Dead, Explosion,
  InputState, GameState,
  SCREEN_W, SCREEN_H, TILE, PLAYER_W, PLAYER_H,
} from './components.js';
import type { InputData, GameStateData } from './components.js';
import { getGameplaySystems, Level } from './systems.js';
import type { LevelResource } from './systems.js';
import { createLevel1 } from './level.js';
import { ArtnorRenderer } from './renderer.js';

// ─── Initialize Engine ───

const engine = new Engine({
  maxEntities: 10_000,
  fixedTimestep: 1 / 60,
  seed: 42,
  headless: false,
});

// Register all components
const components = [
  Position, Velocity, Player, Enemy, Projectile, Collider,
  Platform, PowerUp, Sprite, GravityFlag, Dead, Explosion,
];
for (const comp of components) {
  engine.registerComponent(comp);
}

// ─── Load Level ───

const levelData = createLevel1();

// ─── Initialize Resources ───

const inputState: InputData = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  jumpPressed: false,
  shoot: false,
  start: false,
};
engine.insertResource(InputState, inputState);

const gameState: GameStateData = {
  score: 0,
  lives: 3,
  phase: 'title',
  phaseTimer: 0,
  level: 1,
  scrollX: 0,
  maxScrollX: 0,
  levelWidth: levelData.width,
  playerEntity: -1,
  enemiesKilled: 0,
  nextSpawnIndex: 0,
};
engine.insertResource(GameState, gameState);

const levelResource: LevelResource = { data: levelData };
engine.insertResource(Level, levelResource);

// ─── Register Systems ───

const systems = getGameplaySystems();
engine.addStage('input', systems.input);
engine.addStage('movement', systems.movement);
engine.addStage('combat', systems.combat);
engine.addStage('world', systems.world);
engine.addStage('cleanup', systems.cleanup);

// ─── Canvas Setup ───

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = SCREEN_W;
canvas.height = SCREEN_H;
const renderer = new ArtnorRenderer(canvas, engine.world);

// ─── Input Handling ───

const keysDown = new Set<string>();

document.addEventListener('keydown', (e) => {
  keysDown.add(e.code);

  if (e.code === 'Enter') {
    if (gameState.phase === 'title') {
      startGame();
    } else if (gameState.phase === 'gameover' || gameState.phase === 'victory') {
      resetGame();
    }
  }

  e.preventDefault();
});

document.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
  e.preventDefault();
});

function updateInput(): void {
  const wasJump = inputState.jump;

  inputState.left = keysDown.has('ArrowLeft');
  inputState.right = keysDown.has('ArrowRight');
  inputState.up = keysDown.has('ArrowUp');
  inputState.down = keysDown.has('ArrowDown');
  inputState.jump = keysDown.has('KeyZ');
  inputState.shoot = keysDown.has('KeyX');
  inputState.start = keysDown.has('Enter');

  // Detect jump press (rising edge)
  inputState.jumpPressed = inputState.jump && !wasJump;
}

// ─── Game State Management ───

function startGame(): void {
  gameState.phase = 'playing';
  gameState.score = 0;
  gameState.lives = 3;
  gameState.scrollX = 0;
  gameState.maxScrollX = 0;
  gameState.enemiesKilled = 0;
  gameState.nextSpawnIndex = 0;

  spawnPlayer();
}

function resetGame(): void {
  destroyAll();
  startGame();
}

function destroyAll(): void {
  const queries = [
    engine.world.query(query(Player)),
    engine.world.query(query(Enemy)),
    engine.world.query(query(Projectile)),
    engine.world.query(query(PowerUp)),
    engine.world.query(query(Explosion)),
  ];
  for (const entities of queries) {
    for (const eid of entities) {
      if (engine.world.isAlive(eid)) {
        engine.world.destroy(eid);
      }
    }
  }
}

function spawnPlayer(): void {
  const eid = engine.world.spawn();
  engine.world.addComponent(eid, Position, {
    x: levelData.playerStartX,
    y: levelData.playerStartY,
  });
  engine.world.addComponent(eid, Velocity, { x: 0, y: 0 });
  engine.world.addComponent(eid, Player, {
    lives: gameState.lives,
    weapon: 0,
    aimDir: 0,
    facing: 0,
    invTimer: 2.0,
    state: 0,
    onGround: 0,
    fireCooldown: 0,
  });
  engine.world.addComponent(eid, Collider, {
    width: PLAYER_W,
    height: PLAYER_H,
    offsetX: 0,
    offsetY: -(PLAYER_H / 2),
  });
  engine.world.addComponent(eid, Sprite, {
    spriteType: 0,
    frame: 0,
    animTimer: 0,
    flipX: 0,
    color: 0x4488FF,
  });
  engine.world.addComponent(eid, GravityFlag);

  gameState.playerEntity = eid;
}

// ─── Game Loop ───

let lastTime = performance.now() / 1000;
let accumulator = 0;
const fixedDt = 1 / 60;

function gameLoop(): void {
  const now = performance.now() / 1000;
  const wallDt = Math.min(now - lastTime, 0.1);
  lastTime = now;

  accumulator += wallDt;

  while (accumulator >= fixedDt) {
    updateInput();
    engine.tick();
    accumulator -= fixedDt;

    // Clear per-frame input flags
    inputState.jumpPressed = false;
    inputState.start = false;
  }

  renderer.render();
  requestAnimationFrame(gameLoop);
}

// ─── Start ───

requestAnimationFrame(gameLoop);
