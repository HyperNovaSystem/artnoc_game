import { defineSystem, query, clamp } from '@nova/core';
import {
  Position, Velocity, Player, Enemy, Projectile, Collider,
  Platform, PowerUp, Sprite, GravityFlag, Dead, Explosion,
  InputState, GameState,
  PlayerDeath, EnemyKilled, PowerUpCollected,
  SCREEN_W, SCREEN_H, GRAVITY, PLAYER_SPEED, PLAYER_JUMP,
  PLAYER_W, PLAYER_H, PLAYER_PRONE_H,
  WEAPON_DEFS, ENEMY_DEFS, AIM_DIRS, TILE,
} from './components.js';
import type { LevelData } from './level.js';
import { defineResource } from '@nova/core';
import type { ResourceToken } from '@nova/core';

// Level resource (holds level data for systems to access)
export interface LevelResource {
  data: LevelData;
}
export const Level: ResourceToken<LevelResource> = defineResource<LevelResource>('Level');

// ─── Input System ───

export const InputSystem = defineSystem({
  name: 'Input',
  execute({ resources }) {
    // Input is updated externally by event listeners in main.ts.
    // This system is a placeholder for any per-tick input processing.
    const _input = resources.get(InputState);
    // Nothing needed here - input handled via DOM events
  },
});

// ─── Player Movement System ───

export const PlayerMovementSystem = defineSystem({
  name: 'PlayerMovement',
  query: query(Position, Velocity, Player, Collider).not(Dead),
  execute({ entities, dt, resources }) {
    const input = resources.get(InputState);
    const gs = resources.get(GameState);

    if (gs.phase !== 'playing') return;

    for (const eid of entities) {
      const onGround = Player.onGround[eid] === 1;
      const state = Player.state[eid];

      // Update invincibility timer
      if (Player.invTimer[eid] > 0) {
        Player.invTimer[eid] -= dt;
      }

      // ─── Prone ───
      const wantProne = input.down && onGround && !input.left && !input.right;
      if (wantProne) {
        Player.state[eid] = 4; // prone
        Velocity.x[eid] = 0;
        Collider.height[eid] = PLAYER_PRONE_H;
        Collider.offsetY[eid] = -(PLAYER_PRONE_H / 2);
      } else {
        // Restore standing collider if was prone
        if (state === 4) {
          Collider.height[eid] = PLAYER_H;
          Collider.offsetY[eid] = -(PLAYER_H / 2);
        }

        // ─── Horizontal movement ───
        let moveX = 0;
        if (input.left) moveX -= 1;
        if (input.right) moveX += 1;

        Velocity.x[eid] = moveX * PLAYER_SPEED;

        if (moveX !== 0) {
          Player.facing[eid] = moveX > 0 ? 0 : 1;
          if (onGround) Player.state[eid] = 1; // running
        } else if (onGround) {
          Player.state[eid] = 0; // idle
        }

        // ─── Jump ───
        if (input.jumpPressed && onGround) {
          Velocity.y[eid] = PLAYER_JUMP;
          Player.onGround[eid] = 0;
          Player.state[eid] = 2; // jumping
        }
      }

      // ─── Aim direction (8-way) ───
      let aimDir = Player.facing[eid] === 0 ? 0 : 4; // default: facing direction
      if (input.up && input.right)       aimDir = 1;
      else if (input.up && input.left)   aimDir = 3;
      else if (input.up)                 aimDir = 2;
      else if (input.down && input.right && !onGround) aimDir = 7;
      else if (input.down && input.left && !onGround)  aimDir = 5;
      else if (input.down && !onGround)  aimDir = 6;
      else if (input.right)              aimDir = 0;
      else if (input.left)               aimDir = 4;
      Player.aimDir[eid] = aimDir;

      // Update sprite flip
      Sprite.flipX[eid] = Player.facing[eid];

      // Falling state
      if (!onGround && Velocity.y[eid] > 0) {
        Player.state[eid] = 3; // falling
      }
    }
  },
});

// ─── Gravity System ───

export const GravitySystem = defineSystem({
  name: 'Gravity',
  query: query(Velocity, GravityFlag).not(Dead),
  execute({ entities, dt }) {
    for (const eid of entities) {
      Velocity.y[eid] += GRAVITY * dt;
      // Terminal velocity
      if (Velocity.y[eid] > 800) Velocity.y[eid] = 800;
    }
  },
});

// ─── Physics / Collision System ───
// Moves entities and resolves collisions with platforms

export const PhysicsSystem = defineSystem({
  name: 'Physics',
  query: query(Position, Velocity, Collider).not(Dead),
  execute({ entities, dt, resources, world, events }) {
    const level = resources.get(Level);
    const gs = resources.get(GameState);
    const platforms = level.data.platforms;

    for (const eid of entities) {
      const hasPlayer = world.hasComponent(eid, Player);
      const hasGravity = world.hasComponent(eid, GravityFlag);

      // Move X
      Position.x[eid] += Velocity.x[eid] * dt;

      // Move Y
      const oldY = Position.y[eid];
      Position.y[eid] += Velocity.y[eid] * dt;

      // Platform collision (only for gravity-affected entities)
      if (hasGravity) {
        let grounded = false;
        const ex = Position.x[eid] + Collider.offsetX[eid];
        const ew = Collider.width[eid];
        const eh = Collider.height[eid];
        const ey = Position.y[eid] + Collider.offsetY[eid];

        for (const plat of platforms) {
          const eLeft = ex - ew / 2;
          const eRight = ex + ew / 2;
          const eTop = ey - eh / 2;
          const eBottom = ey + eh / 2;

          const pLeft = plat.x;
          const pRight = plat.x + plat.w;
          const pTop = plat.y;
          const pBottom = plat.y + plat.h;

          // Check X overlap
          if (eRight <= pLeft || eLeft >= pRight) continue;

          if (plat.type === 1) {
            // One-way platform: only collide when falling onto top
            const oldBottom = oldY + Collider.offsetY[eid] + eh / 2;
            if (oldBottom <= pTop && eBottom >= pTop && Velocity.y[eid] >= 0) {
              Position.y[eid] = pTop - Collider.offsetY[eid] - eh / 2;
              Velocity.y[eid] = 0;
              grounded = true;
            }
          } else {
            // Solid platform: full AABB resolution
            if (eBottom > pTop && eTop < pBottom) {
              // Resolve from whichever side has less penetration
              const overlapBottom = eBottom - pTop;
              const overlapTop = pBottom - eTop;
              const overlapLeft = eRight - pLeft;
              const overlapRight = pRight - eLeft;

              const minOverlap = Math.min(overlapBottom, overlapTop, overlapLeft, overlapRight);

              if (minOverlap === overlapBottom && Velocity.y[eid] >= 0) {
                Position.y[eid] = pTop - Collider.offsetY[eid] - eh / 2;
                Velocity.y[eid] = 0;
                grounded = true;
              } else if (minOverlap === overlapTop && Velocity.y[eid] < 0) {
                Position.y[eid] = pBottom - Collider.offsetY[eid] + eh / 2;
                Velocity.y[eid] = 0;
              } else if (minOverlap === overlapLeft) {
                Position.x[eid] -= overlapLeft;
              } else if (minOverlap === overlapRight) {
                Position.x[eid] += overlapRight;
              }
            }
          }
        }

        if (hasPlayer) {
          Player.onGround[eid] = grounded ? 1 : 0;
        }
      }

      // Clamp player to level bounds
      if (hasPlayer) {
        const minX = gs.scrollX + PLAYER_W / 2;
        const maxX = Math.min(gs.scrollX + SCREEN_W - PLAYER_W / 2, level.data.width - PLAYER_W / 2);
        Position.x[eid] = clamp(Position.x[eid], minX, maxX);

        // Kill if fallen off bottom (use full death flow so lives/phase stay consistent)
        if (Position.y[eid] > SCREEN_H + 50) {
          killPlayer(eid, world, events, gs);
        }
      }
    }
  },
});

// ─── Camera Scroll System ───

export const ScrollSystem = defineSystem({
  name: 'Scroll',
  query: query(Position, Player).not(Dead),
  execute({ entities, resources }) {
    const gs = resources.get(GameState);
    const level = resources.get(Level);

    for (const eid of entities) {
      const playerScreenX = Position.x[eid] - gs.scrollX;

      // Scroll when player passes 40% of screen
      if (playerScreenX > SCREEN_W * 0.4) {
        gs.scrollX = Position.x[eid] - SCREEN_W * 0.4;
      }

      // Clamp scroll
      gs.scrollX = clamp(gs.scrollX, gs.maxScrollX, level.data.width - SCREEN_W);
      gs.maxScrollX = Math.max(gs.maxScrollX, gs.scrollX);
    }
  },
});

// ─── Weapon / Shooting System ───

export const WeaponSystem = defineSystem({
  name: 'Weapon',
  query: query(Position, Player).not(Dead),
  execute({ entities, dt, resources, world }) {
    const input = resources.get(InputState);
    const gs = resources.get(GameState);

    if (gs.phase !== 'playing') return;

    for (const eid of entities) {
      // Update cooldown
      Player.fireCooldown[eid] -= dt;

      if (input.shoot && Player.fireCooldown[eid] <= 0) {
        const weaponIdx = Player.weapon[eid];
        const wep = WEAPON_DEFS[weaponIdx];
        Player.fireCooldown[eid] = wep.fireRate;

        const aimDir = Player.aimDir[eid];
        const aim = AIM_DIRS[aimDir];
        const prone = Player.state[eid] === 4;

        // Spawn position offset from player center
        const spawnX = Position.x[eid] + aim.x * 16;
        const spawnY = Position.y[eid] + (prone ? -4 : -12) + aim.y * 10;

        for (let i = 0; i < wep.count; i++) {
          let dirX = aim.x;
          let dirY = aim.y;

          // Apply spread for multi-shot weapons
          if (wep.count > 1) {
            const angleBase = Math.atan2(aim.y, aim.x);
            const spreadOffset = -wep.spread + (wep.spread * 2 * i) / (wep.count - 1);
            const angle = angleBase + spreadOffset;
            dirX = Math.cos(angle);
            dirY = Math.sin(angle);
          } else if (wep.spread > 0) {
            // Small random spread for machine gun
            const angleBase = Math.atan2(aim.y, aim.x);
            const angle = angleBase + (Math.random() - 0.5) * wep.spread;
            dirX = Math.cos(angle);
            dirY = Math.sin(angle);
          }

          const bullet = world.spawn();
          world.addComponent(bullet, Position, { x: spawnX, y: spawnY });
          world.addComponent(bullet, Velocity, {
            x: dirX * wep.speed,
            y: dirY * wep.speed,
          });
          world.addComponent(bullet, Projectile, {
            damage: wep.damage,
            ownerType: 0, // player
            dirX, dirY,
            speed: wep.speed,
            lifetime: 1.5,
          });
          world.addComponent(bullet, Collider, {
            width: 6, height: 6,
            offsetX: 0, offsetY: 0,
          });
          world.addComponent(bullet, Sprite, {
            spriteType: wep.spriteType,
            frame: 0, animTimer: 0, flipX: 0,
            color: wep.color,
          });
        }
      }
    }
  },
});

// ─── Enemy AI System ───

export const EnemyAISystem = defineSystem({
  name: 'EnemyAI',
  query: query(Position, Enemy, Velocity, Collider).not(Dead),
  execute({ entities, dt, resources, world }) {
    const gs = resources.get(GameState);
    if (gs.phase !== 'playing') return;

    // Find player
    const playerEntities = world.query(query(Position, Player).not(Dead));
    if (playerEntities.length === 0) return;
    const playerEid = playerEntities[0];
    const playerX = Position.x[playerEid];
    const playerY = Position.y[playerEid];

    for (const eid of entities) {
      const eType = Enemy.enemyType[eid];
      const def = ENEMY_DEFS[eType];
      const ex = Position.x[eid];
      const ey = Position.y[eid];
      const dx = playerX - ex;
      const dy = playerY - ey;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Update facing toward player
      Enemy.facing[eid] = dx < 0 ? 1 : 0;
      Sprite.flipX[eid] = Enemy.facing[eid];

      // Skip off-screen enemies (with buffer)
      if (ex < gs.scrollX - 100 || ex > gs.scrollX + SCREEN_W + 100) continue;

      Enemy.aiTimer[eid] -= dt;
      Enemy.fireCooldown[eid] -= dt;

      switch (eType) {
        case 0: // Soldier: patrol and shoot
          if (dist < 400) {
            Enemy.aiState[eid] = 2; // attack
            Velocity.x[eid] = 0;
            // Shoot at player
            if (Enemy.fireCooldown[eid] <= 0 && def.fireRate > 0) {
              Enemy.fireCooldown[eid] = def.fireRate;
              fireEnemyBullet(world, ex, ey - 12, playerX, playerY - 12, 200);
            }
          } else {
            // Patrol back and forth
            if (Enemy.aiTimer[eid] <= 0) {
              Enemy.aiTimer[eid] = 2 + Math.random() * 2;
              Enemy.aiState[eid] = Enemy.aiState[eid] === 1 ? 0 : 1;
            }
            Velocity.x[eid] = Enemy.aiState[eid] === 1 ? def.speed : -def.speed;
          }
          break;

        case 1: // Runner: charge at player
          if (dist < 500) {
            const nx = dx / (dist || 1);
            Velocity.x[eid] = nx * def.speed;
          } else {
            Velocity.x[eid] = 0;
          }
          break;

        case 2: // Turret: stationary, shoot
          Velocity.x[eid] = 0;
          if (dist < 350 && Enemy.fireCooldown[eid] <= 0 && def.fireRate > 0) {
            Enemy.fireCooldown[eid] = def.fireRate;
            fireEnemyBullet(world, ex, ey - 8, playerX, playerY - 12, 250);
          }
          break;

        case 3: // Sniper: stationary, aimed shots
          Velocity.x[eid] = 0;
          if (dist < 500 && Enemy.fireCooldown[eid] <= 0 && def.fireRate > 0) {
            Enemy.fireCooldown[eid] = def.fireRate;
            fireEnemyBullet(world, ex, ey - 14, playerX, playerY - 12, 350);
          }
          break;

        case 4: // Boss: move and shoot patterns
          // Simple pattern: move left/right and shoot often
          if (Enemy.aiTimer[eid] <= 0) {
            Enemy.aiTimer[eid] = 1.5 + Math.random();
            Enemy.aiState[eid] = (Enemy.aiState[eid] + 1) % 3;
          }
          if (Enemy.aiState[eid] === 0) {
            Velocity.x[eid] = def.speed;
          } else if (Enemy.aiState[eid] === 1) {
            Velocity.x[eid] = -def.speed;
          } else {
            Velocity.x[eid] = 0;
          }
          // Rapid fire
          if (Enemy.fireCooldown[eid] <= 0 && def.fireRate > 0) {
            Enemy.fireCooldown[eid] = def.fireRate;
            // Fire spread of 3 bullets
            for (let i = -1; i <= 1; i++) {
              const angle = Math.atan2(dy, dx) + i * 0.3;
              const bx = Math.cos(angle);
              const by = Math.sin(angle);
              fireEnemyBulletDir(world, ex, ey - 20, bx, by, 200);
            }
          }
          break;
      }
    }
  },
});

function fireEnemyBullet(world: any, fromX: number, fromY: number, toX: number, toY: number, speed: number): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  fireEnemyBulletDir(world, fromX, fromY, dx / dist, dy / dist, speed);
}

function fireEnemyBulletDir(world: any, fromX: number, fromY: number, dirX: number, dirY: number, speed: number): void {
  const bullet = world.spawn();
  world.addComponent(bullet, Position, { x: fromX, y: fromY });
  world.addComponent(bullet, Velocity, {
    x: dirX * speed,
    y: dirY * speed,
  });
  world.addComponent(bullet, Projectile, {
    damage: 1,
    ownerType: 1, // enemy
    dirX, dirY,
    speed,
    lifetime: 3.0,
  });
  world.addComponent(bullet, Collider, {
    width: 5, height: 5,
    offsetX: 0, offsetY: 0,
  });
  world.addComponent(bullet, Sprite, {
    spriteType: 6,
    frame: 0, animTimer: 0, flipX: 0,
    color: 0xFF4444,
  });
}

// ─── Projectile Lifetime System ───

export const ProjectileSystem = defineSystem({
  name: 'Projectile',
  query: query(Projectile, Position),
  execute({ entities, dt, world, resources }) {
    const gs = resources.get(GameState);

    for (const eid of entities) {
      Projectile.lifetime[eid] -= dt;

      // Remove if expired or way off screen
      const px = Position.x[eid];
      if (Projectile.lifetime[eid] <= 0 ||
          px < gs.scrollX - 100 || px > gs.scrollX + SCREEN_W + 100 ||
          Position.y[eid] < -100 || Position.y[eid] > SCREEN_H + 100) {
        world.destroy(eid);
      }
    }
  },
});

// ─── Hit Detection System ───
// Player bullets vs enemies, enemy bullets vs player

export const HitDetectionSystem = defineSystem({
  name: 'HitDetection',
  execute({ resources, world, events }) {
    const gs = resources.get(GameState);
    if (gs.phase !== 'playing') return;

    const bullets = world.query(query(Position, Projectile, Collider));
    const enemies = world.query(query(Position, Enemy, Collider).not(Dead));
    const players = world.query(query(Position, Player, Collider).not(Dead));

    for (const bEid of bullets) {
      const ownerType = Projectile.ownerType[bEid];
      const bx = Position.x[bEid] + Collider.offsetX[bEid];
      const by = Position.y[bEid] + Collider.offsetY[bEid];
      const bw = Collider.width[bEid] / 2;
      const bh = Collider.height[bEid] / 2;

      if (ownerType === 0) {
        // Player bullet → enemy
        for (const eEid of enemies) {
          const ex = Position.x[eEid] + Collider.offsetX[eEid];
          const ey = Position.y[eEid] + Collider.offsetY[eEid];
          const ew = Collider.width[eEid] / 2;
          const eh = Collider.height[eEid] / 2;

          if (bx - bw < ex + ew && bx + bw > ex - ew &&
              by - bh < ey + eh && by + bh > ey - eh) {
            // Hit!
            const eType = Enemy.enemyType[eEid];
            const def = ENEMY_DEFS[eType];
            // Enemy HP is stored in Sprite.animTimer (initialized from ENEMY_DEFS on spawn)
            // and decremented by projectile damage here until it reaches zero or below.
            const damage = Projectile.damage[bEid];
            Sprite.animTimer[eEid] -= damage;
            if (Sprite.animTimer[eEid] <= 0) {
              world.addComponent(eEid, Dead);
              events.emit(EnemyKilled, {
                entity: eEid,
                enemyType: eType,
                x: Position.x[eEid],
                y: Position.y[eEid],
              });
              gs.score += def.score;
              gs.enemiesKilled++;

              // Spawn explosion
              const exp = world.spawn();
              world.addComponent(exp, Position, { x: Position.x[eEid], y: Position.y[eEid] });
              const expDuration = 0.4;
              world.addComponent(exp, Explosion, { timer: expDuration, radius: eType === 4 ? 40 : 16 });
              world.addComponent(exp, Sprite, {
                spriteType: 10, frame: 0, animTimer: expDuration, flipX: 0,
                color: 0xFF8800,
              });
            }

            // Destroy bullet
            world.destroy(bEid);
            break;
          }
        }
      } else {
        // Enemy bullet → player
        for (const pEid of players) {
          if (Player.invTimer[pEid] > 0) continue;

          const px = Position.x[pEid] + Collider.offsetX[pEid];
          const py = Position.y[pEid] + Collider.offsetY[pEid];
          const pw = Collider.width[pEid] / 2;
          const ph = Collider.height[pEid] / 2;

          if (bx - bw < px + pw && bx + bw > px - pw &&
              by - bh < py + ph && by + bh > py - ph) {
            // Player hit!
            world.destroy(bEid);
            killPlayer(pEid, world, events, gs);
            break;
          }
        }
      }
    }

    // Also check enemy body → player contact damage
    for (const pEid of players) {
      if (Player.invTimer[pEid] > 0) continue;

      const px = Position.x[pEid] + Collider.offsetX[pEid];
      const py = Position.y[pEid] + Collider.offsetY[pEid];
      const pw = Collider.width[pEid] / 2;
      const ph = Collider.height[pEid] / 2;

      for (const eEid of enemies) {
        const ex = Position.x[eEid] + Collider.offsetX[eEid];
        const ey = Position.y[eEid] + Collider.offsetY[eEid];
        const ew = Collider.width[eEid] / 2;
        const eh = Collider.height[eEid] / 2;

        if (px - pw < ex + ew && px + pw > ex - ew &&
            py - ph < ey + eh && py + ph > ey - eh) {
          killPlayer(pEid, world, events, gs);
          break;
        }
      }
    }
  },
});

function killPlayer(pEid: number, world: any, events: any, gs: any): void {
  events.emit(PlayerDeath, {
    x: Position.x[pEid],
    y: Position.y[pEid],
  });
  world.addComponent(pEid, Dead);
  gs.lives--;
  gs.phase = 'dying';
  gs.phaseTimer = 2.0;

  // Spawn death explosion
  const exp = world.spawn();
  world.addComponent(exp, Position, { x: Position.x[pEid], y: Position.y[pEid] });
  const deathExpDuration = 0.6;
  world.addComponent(exp, Explosion, { timer: deathExpDuration, radius: 20 });
  world.addComponent(exp, Sprite, {
    spriteType: 10, frame: 0, animTimer: deathExpDuration, flipX: 0,
    color: 0xFFAA00,
  });
}

// ─── Power-Up System ───

export const PowerUpSystem = defineSystem({
  name: 'PowerUp',
  query: query(Position, PowerUp, Collider).not(Dead),
  execute({ entities, resources, world, events }) {
    const gs = resources.get(GameState);
    if (gs.phase !== 'playing') return;

    const players = world.query(query(Position, Player, Collider).not(Dead));
    if (players.length === 0) return;
    const pEid = players[0];

    const px = Position.x[pEid];
    const py = Position.y[pEid];

    for (const eid of entities) {
      const dx = Position.x[eid] - px;
      const dy = Position.y[eid] - py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 24) {
        const powerType = PowerUp.powerType[eid];

        if (powerType <= 4) {
          // Weapon pickup (0-4 map to weapon types 1-4, or barrier=4)
          if (powerType < 4) {
            Player.weapon[pEid] = powerType + 1; // spread=1, laser=2, machineGun=3, fireball=4
          } else {
            // Barrier: grant invincibility
            Player.invTimer[pEid] = 10.0;
          }
        } else {
          // Extra life
          gs.lives++;
        }

        events.emit(PowerUpCollected, { powerType });
        world.destroy(eid);
      }
    }
  },
});

// ─── Spawn System ───
// Activates enemy and powerup spawns based on camera scroll position

export const SpawnSystem = defineSystem({
  name: 'Spawn',
  execute({ resources, world }) {
    const gs = resources.get(GameState);
    const level = resources.get(Level);

    if (gs.phase !== 'playing') return;

    // Check spawn triggers
    while (gs.nextSpawnIndex < level.data.spawns.length) {
      const trigger = level.data.spawns[gs.nextSpawnIndex];
      if (gs.scrollX < trigger.scrollX) break;

      // Activate this spawn
      for (const spawn of trigger.enemies) {
        spawnEnemy(world, spawn.type, spawn.x, spawn.y);
      }
      gs.nextSpawnIndex++;
    }

    // Check powerup spawns (simple linear scan, small array)
    for (const pu of level.data.powerUps) {
      if (gs.scrollX >= pu.scrollX && gs.scrollX < pu.scrollX + 10) {
        // Check if already spawned (approximate: spawn once per scroll region)
        const existing = world.query(query(Position, PowerUp).not(Dead));
        let alreadySpawned = false;
        for (const eid of existing) {
          if (Math.abs(Position.x[eid] - pu.x) < 5 && Math.abs(Position.y[eid] - pu.y) < 5) {
            alreadySpawned = true;
            break;
          }
        }
        if (!alreadySpawned) {
          spawnPowerUp(world, pu.powerType, pu.x, pu.y);
        }
      }
    }
  },
});

function spawnEnemy(world: any, eType: number, x: number, y: number): void {
  const def = ENEMY_DEFS[eType];
  const eid = world.spawn();
  world.addComponent(eid, Position, { x, y });
  world.addComponent(eid, Velocity, { x: 0, y: 0 });
  world.addComponent(eid, Enemy, {
    enemyType: eType,
    aiState: 0,
    aiTimer: Math.random() * 2,
    facing: 1, // face left (toward player)
    fireCooldown: def.fireRate * Math.random(),
  });
  world.addComponent(eid, Collider, {
    width: def.width,
    height: def.height,
    offsetX: 0,
    offsetY: -(def.height / 2),
  });
  world.addComponent(eid, Sprite, {
    spriteType: eType + 1, // 1=soldier, 2=runner, etc.
    frame: 0,
    animTimer: def.health, // REUSE animTimer as health counter
    flipX: 1,
    color: def.color,
  });
  if (eType !== 2) {
    // Non-turrets get gravity
    world.addComponent(eid, GravityFlag);
  }
}

function spawnPowerUp(world: any, powerType: number, x: number, y: number): void {
  const colors = [0xFF8844, 0x44AAFF, 0xFFFF44, 0xFF4400, 0x44FFAA, 0xFF44FF];
  const eid = world.spawn();
  world.addComponent(eid, Position, { x, y });
  world.addComponent(eid, Velocity, { x: 0, y: 0 });
  world.addComponent(eid, PowerUp, { powerType });
  world.addComponent(eid, Collider, {
    width: 16, height: 16,
    offsetX: 0, offsetY: -8,
  });
  world.addComponent(eid, Sprite, {
    spriteType: 11,
    frame: 0, animTimer: 0, flipX: 0,
    color: colors[powerType] ?? 0xFFFFFF,
  });
}

// ─── Death / Respawn System ───

export const DeathRespawnSystem = defineSystem({
  name: 'DeathRespawn',
  execute({ dt, resources, world }) {
    const gs = resources.get(GameState);
    const level = resources.get(Level);

    if (gs.phase === 'dying') {
      gs.phaseTimer -= dt;
      if (gs.phaseTimer <= 0) {
        if (gs.lives <= 0) {
          gs.phase = 'gameover';
        } else {
          // Respawn player
          gs.phase = 'playing';
          respawnPlayer(world, gs, level.data);
        }
      }
    }
  },
});

function respawnPlayer(world: any, gs: any, levelData: LevelData): void {
  // Clean up old dead player
  const deadPlayers = world.query(query(Player, Dead));
  for (const eid of deadPlayers) {
    world.destroy(eid);
  }

  // Spawn new player at current scroll position
  const eid = world.spawn();
  const spawnX = gs.scrollX + SCREEN_W * 0.2;
  const spawnY = SCREEN_H - TILE - 34;

  world.addComponent(eid, Position, { x: spawnX, y: spawnY });
  world.addComponent(eid, Velocity, { x: 0, y: 0 });
  world.addComponent(eid, Player, {
    lives: gs.lives,
    weapon: 0, // reset to rifle
    aimDir: 0,
    facing: 0,
    invTimer: 3.0, // 3 seconds invincibility
    state: 0,
    onGround: 0,
    fireCooldown: 0,
  });
  world.addComponent(eid, Collider, {
    width: PLAYER_W,
    height: PLAYER_H,
    offsetX: 0,
    offsetY: -(PLAYER_H / 2),
  });
  world.addComponent(eid, Sprite, {
    spriteType: 0,
    frame: 0, animTimer: 0, flipX: 0,
    color: 0x44AAFF,
  });
  world.addComponent(eid, GravityFlag);

  gs.playerEntity = eid;
}

// ─── Explosion System ───

export const ExplosionSystem = defineSystem({
  name: 'Explosion',
  query: query(Explosion),
  execute({ entities, dt, world }) {
    for (const eid of entities) {
      Explosion.timer[eid] -= dt;
      if (Explosion.timer[eid] <= 0) {
        world.destroy(eid);
      }
    }
  },
});

// ─── Cleanup System ───
// Remove entities that are far off screen

export const CleanupSystem = defineSystem({
  name: 'Cleanup',
  query: query(Position, Dead),
  execute({ entities, world }) {
    for (const eid of entities) {
      world.destroy(eid);
    }
  },
});

// ─── Off-Screen Cleanup ───

export const OffScreenCleanupSystem = defineSystem({
  name: 'OffScreenCleanup',
  query: query(Position, Enemy).not(Dead),
  execute({ entities, resources, world }) {
    const gs = resources.get(GameState);

    for (const eid of entities) {
      const x = Position.x[eid];
      // Remove enemies far behind camera
      if (x < gs.scrollX - 200) {
        world.destroy(eid);
      }
      // Remove enemies that fell off
      if (Position.y[eid] > SCREEN_H + 100) {
        world.destroy(eid);
      }
    }
  },
});

// ─── Victory Check System ───

export const VictoryCheckSystem = defineSystem({
  name: 'VictoryCheck',
  execute({ resources, world }) {
    const gs = resources.get(GameState);
    const level = resources.get(Level);

    if (gs.phase !== 'playing') return;

    // Check if boss is dead (all spawns triggered and no enemies of type 4 alive)
    if (gs.nextSpawnIndex >= level.data.spawns.length) {
      const bosses = world.query(query(Enemy).not(Dead));
      let bossAlive = false;
      for (const eid of bosses) {
        if (Enemy.enemyType[eid] === 4) {
          bossAlive = true;
          break;
        }
      }
      if (!bossAlive && gs.scrollX >= level.data.bossScrollX) {
        gs.phase = 'victory';
      }
    }
  },
});

// ─── Export all systems grouped by stage ───

export function getGameplaySystems() {
  return {
    input: [InputSystem],
    movement: [
      PlayerMovementSystem,
      EnemyAISystem,
      GravitySystem,
      PhysicsSystem,
    ],
    combat: [
      WeaponSystem,
      ProjectileSystem,
      HitDetectionSystem,
      PowerUpSystem,
    ],
    world: [
      ScrollSystem,
      SpawnSystem,
      VictoryCheckSystem,
    ],
    cleanup: [
      DeathRespawnSystem,
      ExplosionSystem,
      CleanupSystem,
      OffScreenCleanupSystem,
    ],
  };
}
