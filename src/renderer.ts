import { query } from '@nova/core';
import type { World } from '@nova/core';
import {
  Position, Velocity, Player, Enemy, Projectile, Collider,
  Platform, PowerUp, Sprite, Dead, Explosion,
  GameState, InputState,
  SCREEN_W, SCREEN_H, TILE, PLAYER_W, PLAYER_H,
  WEAPON_DEFS, ENEMY_DEFS,
} from './components.js';
import { Level } from './systems.js';

function colorToCSS(packed: number): string {
  const r = (packed >> 16) & 0xFF;
  const g = (packed >> 8) & 0xFF;
  const b = packed & 0xFF;
  return `rgb(${r},${g},${b})`;
}

function colorToAlpha(packed: number, a: number): string {
  const r = (packed >> 16) & 0xFF;
  const g = (packed >> 8) & 0xFF;
  const b = packed & 0xFF;
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Canvas2D renderer for Artnoc.
 * Draws everything relative to the camera scroll position.
 */
export class ArtnorRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private world: World;
  private frameCount = 0;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.world = world;
  }

  render(): void {
    this.frameCount++;
    const ctx = this.ctx;
    const world = this.world;
    const gs = world.getResource(GameState);

    // Clear
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    if (gs.phase === 'title') {
      this.drawTitle(ctx, gs);
      return;
    }

    const scrollX = gs.scrollX;

    // Draw background layers (parallax)
    this.drawBackground(ctx, scrollX);

    // Draw platforms
    this.drawPlatforms(ctx, scrollX);

    // Draw powerups
    this.drawPowerUps(ctx, world, scrollX);

    // Draw enemies
    this.drawEnemies(ctx, world, scrollX);

    // Draw player
    this.drawPlayer(ctx, world, scrollX);

    // Draw projectiles
    this.drawProjectiles(ctx, world, scrollX);

    // Draw explosions
    this.drawExplosions(ctx, world, scrollX);

    // Draw HUD
    this.drawHUD(ctx, gs);

    // Draw overlays
    if (gs.phase === 'gameover') {
      this.drawOverlay(ctx, 'GAME OVER', '#FF4444', `Score: ${gs.score}`);
    } else if (gs.phase === 'victory') {
      this.drawOverlay(ctx, 'MISSION COMPLETE', '#44FF44', `Score: ${gs.score}`);
    } else if (gs.phase === 'dying') {
      // Flash effect
      if (Math.floor(gs.phaseTimer * 8) % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
    }
  }

  private drawBackground(ctx: CanvasRenderingContext2D, scrollX: number): void {
    // Far mountains (slow parallax)
    const mountainOffset = scrollX * 0.1;
    ctx.fillStyle = '#0f0f28';
    for (let i = -1; i < 8; i++) {
      const bx = i * 200 - (mountainOffset % 200);
      drawMountain(ctx, bx, SCREEN_H - 100, 200, 80, '#151530');
    }

    // Mid trees (medium parallax)
    const treeOffset = scrollX * 0.3;
    ctx.fillStyle = '#0a1a10';
    for (let i = -1; i < 16; i++) {
      const tx = i * 80 - (treeOffset % 80);
      drawTree(ctx, tx, SCREEN_H - 60, '#0d2015');
    }

    // Near foliage (faster parallax)
    const foliageOffset = scrollX * 0.5;
    for (let i = -1; i < 20; i++) {
      const fx = i * 60 - (foliageOffset % 60);
      ctx.fillStyle = '#0a1a0f';
      ctx.fillRect(fx, SCREEN_H - 35, 50, 12);
    }
  }

  private drawPlatforms(ctx: CanvasRenderingContext2D, scrollX: number): void {
    const level = this.world.getResource(Level);

    for (const plat of level.data.platforms) {
      const sx = plat.x - scrollX;
      // Skip off-screen
      if (sx + plat.w < -10 || sx > SCREEN_W + 10) continue;

      if (plat.type === 0) {
        // Solid platform
        ctx.fillStyle = '#2a3a2a';
        ctx.fillRect(sx, plat.y, plat.w, plat.h);
        // Top edge highlight
        ctx.fillStyle = '#3a5a3a';
        ctx.fillRect(sx, plat.y, plat.w, 2);
        // Pattern
        ctx.fillStyle = '#223322';
        for (let tx = 0; tx < plat.w; tx += TILE) {
          ctx.fillRect(sx + tx, plat.y + 3, 1, plat.h - 3);
        }
      } else {
        // One-way platform
        ctx.fillStyle = '#4a3a2a';
        ctx.fillRect(sx, plat.y, plat.w, plat.h);
        // Top edge
        ctx.fillStyle = '#6a5a3a';
        ctx.fillRect(sx, plat.y, plat.w, 2);
        // Dashed bottom to indicate one-way
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#4a3a2a88';
        ctx.beginPath();
        ctx.moveTo(sx, plat.y + plat.h);
        ctx.lineTo(sx + plat.w, plat.y + plat.h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, world: World, scrollX: number): void {
    const players = world.query(query(Position, Player, Sprite).not(Dead));

    for (const eid of players) {
      const sx = Position.x[eid] - scrollX;
      const sy = Position.y[eid];
      const state = Player.state[eid];
      const facing = Player.facing[eid];
      const aimDir = Player.aimDir[eid];
      const inv = Player.invTimer[eid];

      // Blink during invincibility
      if (inv > 0 && Math.floor(inv * 10) % 2 === 0) continue;

      ctx.save();
      ctx.translate(sx, sy);
      if (facing === 1) ctx.scale(-1, 1);

      const isProne = state === 4;
      const w = PLAYER_W;
      const h = isProne ? 16 : PLAYER_H;

      // Body
      ctx.fillStyle = '#4488FF';
      ctx.fillRect(-w / 2, -h, w, h);

      // Head
      if (!isProne) {
        ctx.fillStyle = '#FFCC88';
        ctx.fillRect(-4, -h - 6, 8, 8);
        // Hair/headband
        ctx.fillStyle = '#FF4444';
        ctx.fillRect(-5, -h - 3, 10, 2);
      }

      // Legs (running animation)
      if (state === 1) {
        const legFrame = Math.floor(this.frameCount / 4) % 4;
        ctx.fillStyle = '#336699';
        if (legFrame < 2) {
          ctx.fillRect(-4, 0, 4, 6);
          ctx.fillRect(2, -2, 4, 4);
        } else {
          ctx.fillRect(-4, -2, 4, 4);
          ctx.fillRect(2, 0, 4, 6);
        }
      }

      // Gun (aim direction indicator)
      ctx.fillStyle = '#AAAAAA';
      const gunLen = 10;
      // Convert aim dir to local direction
      const aim = getLocalAim(aimDir, facing);
      ctx.fillRect(aim.x * 2, -h / 2 - 4 + aim.y * 2, aim.x * gunLen || 3, aim.y * gunLen || 2);

      ctx.restore();

      // Weapon name indicator
      const weaponIdx = Player.weapon[eid];
      if (weaponIdx > 0) {
        const wep = WEAPON_DEFS[weaponIdx];
        ctx.fillStyle = colorToCSS(wep.color);
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(wep.name[0], sx, sy - PLAYER_H - 10);
      }
    }
  }

  private drawEnemies(ctx: CanvasRenderingContext2D, world: World, scrollX: number): void {
    const enemies = world.query(query(Position, Enemy, Sprite, Collider).not(Dead));

    for (const eid of enemies) {
      const sx = Position.x[eid] - scrollX;
      const sy = Position.y[eid];

      // Skip off-screen
      if (sx < -50 || sx > SCREEN_W + 50) continue;

      const eType = Enemy.enemyType[eid];
      const def = ENEMY_DEFS[eType];
      const facing = Enemy.facing[eid];
      const color = Sprite.color[eid];
      const w = def.width;
      const h = def.height;

      ctx.save();
      ctx.translate(sx, sy);
      if (facing === 1) ctx.scale(-1, 1);

      switch (eType) {
        case 0: // Soldier
        case 3: // Sniper
          ctx.fillStyle = colorToCSS(color);
          ctx.fillRect(-w / 2, -h, w, h);
          // Head
          ctx.fillStyle = '#CCAA88';
          ctx.fillRect(-3, -h - 5, 6, 6);
          // Helmet
          ctx.fillStyle = eType === 3 ? '#225522' : '#553322';
          ctx.fillRect(-4, -h - 5, 8, 3);
          break;

        case 1: // Runner
          ctx.fillStyle = colorToCSS(color);
          ctx.fillRect(-w / 2, -h, w, h);
          // Angry face
          ctx.fillStyle = '#FF0000';
          ctx.fillRect(-2, -h - 3, 4, 4);
          break;

        case 2: // Turret
          ctx.fillStyle = colorToCSS(color);
          // Base
          ctx.fillRect(-w / 2, -h / 2, w, h / 2);
          // Barrel
          ctx.fillStyle = '#666666';
          ctx.fillRect(0, -h / 2 - 4, 12, 4);
          // Top
          ctx.fillStyle = '#777777';
          ctx.fillRect(-w / 2 + 2, -h + 2, w - 4, h / 2 - 2);
          break;

        case 4: // Boss
          // Large body
          ctx.fillStyle = colorToCSS(color);
          ctx.fillRect(-w / 2, -h, w, h);
          // Face
          ctx.fillStyle = '#880000';
          ctx.fillRect(-10, -h + 8, 20, 12);
          // Eyes
          ctx.fillStyle = '#FFFF00';
          ctx.fillRect(-8, -h + 10, 4, 4);
          ctx.fillRect(4, -h + 10, 4, 4);
          // Health bar
          const maxHp = def.health;
          const curHp = Sprite.animTimer[eid]; // health stored here
          const hpPct = Math.max(0, curHp / maxHp);
          ctx.fillStyle = '#333';
          ctx.fillRect(-w / 2, -h - 8, w, 4);
          ctx.fillStyle = hpPct > 0.5 ? '#44FF44' : hpPct > 0.25 ? '#FFFF44' : '#FF4444';
          ctx.fillRect(-w / 2, -h - 8, w * hpPct, 4);
          break;
      }

      ctx.restore();
    }
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, world: World, scrollX: number): void {
    const bullets = world.query(query(Position, Projectile, Sprite));

    for (const eid of bullets) {
      const sx = Position.x[eid] - scrollX;
      const sy = Position.y[eid];

      if (sx < -10 || sx > SCREEN_W + 10) continue;

      const color = Sprite.color[eid];
      const ownerType = Projectile.ownerType[eid];
      const spriteType = Sprite.spriteType[eid];

      ctx.fillStyle = colorToCSS(color);

      if (spriteType === 8) {
        // Laser: elongated
        const dx = Velocity.x[eid];
        const dy = Velocity.y[eid];
        const angle = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        ctx.fillRect(-8, -1, 16, 2);
        ctx.restore();
      } else if (spriteType === 9) {
        // Fireball: larger circle
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        // Glow
        ctx.fillStyle = colorToAlpha(color, 0.3);
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (spriteType === 7) {
        // Spread shot: diamond
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      } else {
        // Standard bullet: small rect
        if (ownerType === 1) {
          // Enemy bullet: circle
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(sx - 3, sy - 1, 6, 2);
        }
      }
    }
  }

  private drawExplosions(ctx: CanvasRenderingContext2D, world: World, scrollX: number): void {
    const explosions = world.query(query(Position, Explosion, Sprite));

    for (const eid of explosions) {
      const sx = Position.x[eid] - scrollX;
      const sy = Position.y[eid];
      const timer = Explosion.timer[eid];
      const maxRadius = Explosion.radius[eid];
      const color = Sprite.color[eid];

      // Expand then shrink
      const progress = 1 - timer / 0.4;
      const radius = maxRadius * (progress < 0.5 ? progress * 2 : 2 - progress * 2);
      const alpha = 1 - progress;

      // Outer glow
      ctx.beginPath();
      ctx.arc(sx, sy, radius * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = colorToAlpha(color, alpha * 0.3);
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fillStyle = colorToAlpha(0xFFFFFF, alpha * 0.6);
      ctx.fill();

      // Inner
      ctx.beginPath();
      ctx.arc(sx, sy, radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = colorToAlpha(color, alpha);
      ctx.fill();
    }
  }

  private drawPowerUps(ctx: CanvasRenderingContext2D, world: World, scrollX: number): void {
    const powerUps = world.query(query(Position, PowerUp, Sprite).not(Dead));

    for (const eid of powerUps) {
      const sx = Position.x[eid] - scrollX;
      const sy = Position.y[eid];

      if (sx < -20 || sx > SCREEN_W + 20) continue;

      const color = Sprite.color[eid];
      const bob = Math.sin(this.frameCount * 0.08) * 3;

      // Capsule shape
      ctx.fillStyle = colorToCSS(color);
      ctx.beginPath();
      ctx.arc(sx, sy - 8 + bob, 10, 0, Math.PI * 2);
      ctx.fill();

      // Label
      const labels = ['S', 'L', 'M', 'F', 'B', '1UP'];
      const powerType = PowerUp.powerType[eid];
      ctx.fillStyle = '#000';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[powerType] ?? '?', sx, sy - 8 + bob);

      // Glow ring
      ctx.strokeStyle = colorToAlpha(color, 0.4 + Math.sin(this.frameCount * 0.1) * 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy - 8 + bob, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawHUD(ctx: CanvasRenderingContext2D, gs: any): void {
    // Top bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, SCREEN_W, 24);

    ctx.font = 'bold 12px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // Score
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`SCORE: ${gs.score}`, 10, 12);

    // Lives
    ctx.fillStyle = '#FF6B6B';
    ctx.fillText(`LIVES: ${gs.lives}`, 200, 12);

    // Level
    ctx.fillStyle = '#8BE9FD';
    ctx.fillText(`STAGE 1`, 350, 12);

    // Enemies killed
    ctx.fillStyle = '#50FA7B';
    ctx.fillText(`KILLS: ${gs.enemiesKilled}`, 470, 12);

    // Weapon
    const players = this.world.query(query(Player).not(Dead));
    if (players.length > 0) {
      const weaponIdx = Player.weapon[players[0]];
      const wep = WEAPON_DEFS[weaponIdx];
      ctx.fillStyle = colorToCSS(wep.color);
      ctx.textAlign = 'right';
      ctx.fillText(`[${wep.name}]`, SCREEN_W - 10, 12);
    }
  }

  private drawTitle(ctx: CanvasRenderingContext2D, gs: any): void {
    // Background
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    // Title
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#FF4444';
    ctx.font = 'bold 56px monospace';
    ctx.fillText('ARTNOC', SCREEN_W / 2, SCREEN_H / 2 - 60);

    ctx.fillStyle = '#888';
    ctx.font = '16px monospace';
    ctx.fillText('A Contra-Style Side-Scroller', SCREEN_W / 2, SCREEN_H / 2 - 10);

    ctx.fillStyle = '#666';
    ctx.font = '12px monospace';
    ctx.fillText('Built with the HyperNova ECS Engine', SCREEN_W / 2, SCREEN_H / 2 + 20);

    // Blinking "Press Start"
    if (Math.floor(this.frameCount / 30) % 2 === 0) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('PRESS ENTER TO START', SCREEN_W / 2, SCREEN_H / 2 + 80);
    }

    // Controls
    ctx.fillStyle = '#444';
    ctx.font = '10px monospace';
    ctx.fillText('ARROW KEYS: Move/Aim  |  Z: Jump  |  X: Shoot  |  DOWN: Prone', SCREEN_W / 2, SCREEN_H - 40);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, title: string, color: string, subtitle: string): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = color;
    ctx.font = 'bold 42px monospace';
    ctx.fillText(title, SCREEN_W / 2, SCREEN_H / 2 - 20);

    ctx.fillStyle = '#fff';
    ctx.font = '20px monospace';
    ctx.fillText(subtitle, SCREEN_W / 2, SCREEN_H / 2 + 25);

    ctx.fillStyle = '#888';
    ctx.font = '14px monospace';
    ctx.fillText('Press ENTER to restart', SCREEN_W / 2, SCREEN_H / 2 + 65);
  }
}

function getLocalAim(aimDir: number, facing: number): { x: number; y: number } {
  // In the player's local space (already flipped if facing left)
  const dirs = [
    { x: 1, y: 0 },     // right
    { x: 1, y: -1 },    // up-right
    { x: 0, y: -1 },    // up
    { x: -1, y: -1 },   // up-left
    { x: -1, y: 0 },    // left
    { x: -1, y: 1 },    // down-left
    { x: 0, y: 1 },     // down
    { x: 1, y: 1 },     // down-right
  ];
  const dir = dirs[aimDir] ?? dirs[0];
  // If facing left, the ctx is already mirrored, so always show "forward"
  return dir;
}

function drawMountain(ctx: CanvasRenderingContext2D, x: number, baseY: number, width: number, height: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x + width / 2, baseY - height);
  ctx.lineTo(x + width, baseY);
  ctx.closePath();
  ctx.fill();
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, baseY: number, color: string): void {
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(x + 8, baseY - 5, 4, 10);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, baseY - 5);
  ctx.lineTo(x + 10, baseY - 25);
  ctx.lineTo(x + 20, baseY - 5);
  ctx.closePath();
  ctx.fill();
}
