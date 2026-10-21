import { TILE, BLOCKS, BLOCK, WIDTH, HEIGHT } from './world.mjs';
export const FEEL = Object.freeze({ tick: 1 / 60, speed: 270, acceleration: 540, deceleration: 1080, gravity: 2160, jumpSpeed: 450.9, fallSpeed: 900, jumpHold: .25, coyote: .09, buffer: .12, step: 24.1 });
export function createPlayer(spawn) {
  return { x: spawn.x, y: spawn.y, w: 18, h: 38, vx: 0, vy: 0, grounded: false, coyote: 0, jumpBuffer: 0, hold: 0, dropping: 0, facing: 1, walk: 0, renderOffset: 0 };
}
export function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
export function collides(world, x, y, w, h) {
  for (let ty = Math.floor(y / TILE); ty <= Math.floor((y + h - .001) / TILE); ty++)
    for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + w - .001) / TILE); tx++) if (world.solid(tx, ty)) return true;
  return false;
}
function floorAt(world, x, bottom, width, distance, platforms) {
  let result = Infinity;
  for (let ty = Math.floor((bottom - .01) / TILE); ty <= Math.floor((bottom + distance) / TILE); ty++)
    for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + width - .001) / TILE); tx++) {
      const b = BLOCKS[world.get(tx, ty)], top = ty * TILE;
      if ((b.solid || platforms && b.platform) && top >= bottom - .1 && top <= bottom + distance + .1) result = Math.min(result, top);
    }
  return result;
}
export function stepPlayer(p, world, input, dt = FEEL.tick) {
  const wasGrounded = p.grounded;
  p.coyote = wasGrounded ? FEEL.coyote : Math.max(0, p.coyote - dt);
  p.jumpBuffer = input.jumpPressed ? FEEL.buffer : Math.max(0, p.jumpBuffer - dt);
  p.dropping = Math.max(0, p.dropping - dt);
  if (input.down && input.jumpPressed) { p.dropping = .3; p.jumpBuffer = 0; p.grounded = false; }
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (direction) {
    if (p.vx * direction < 0) p.vx *= Math.pow(.9, dt * 60);
    p.vx += direction * FEEL.acceleration * dt;
    p.facing = direction;
  } else {
    p.vx = Math.sign(p.vx) * Math.max(0, Math.abs(p.vx) - FEEL.deceleration * dt);
  }
  p.vx = Math.max(-FEEL.speed, Math.min(FEEL.speed, p.vx));
  let jumped = false;
  if (p.jumpBuffer > 0 && p.coyote > 0 && !p.dropping) {
    p.vy = -FEEL.jumpSpeed; p.hold = FEEL.jumpHold; p.jumpBuffer = 0; p.coyote = 0; p.grounded = false; jumped = true;
  }
  if (input.jump && p.hold > 0) { p.vy = -FEEL.jumpSpeed; p.hold = Math.max(0, p.hold - dt); }
  else p.hold = 0;
  p.vy = Math.min(FEEL.fallSpeed, p.vy + FEEL.gravity * dt);
  const dx = p.vx * dt;
  if (!collides(world, p.x + dx, p.y, p.w, p.h)) p.x += dx;
  else {
    let stepped = false;
    if (wasGrounded && !jumped && p.vy >= 0 && !input.down) {
      const lift = (p.y + p.h) - Math.floor((p.y + p.h - .01) / TILE) * TILE;
      if (lift <= FEEL.step && !collides(world, p.x + dx, p.y - lift, p.w, p.h) && !collides(world, p.x, p.y - lift, p.w, p.h)) {
        p.y -= lift; p.x += dx; p.renderOffset += lift; stepped = true;
      }
    }
    if (!stepped) {
      if (dx > 0) p.x = Math.floor((p.x + p.w + dx - .001) / TILE) * TILE - p.w;
      if (dx < 0) p.x = (Math.floor((p.x + dx) / TILE) + 1) * TILE;
      p.vx = 0;
    }
  }
  const dy = p.vy * dt;
  const oldBottom = p.y + p.h;
  p.grounded = false;
  if (p.vy >= 0) {
    const snap = wasGrounded && !jumped && !p.dropping ? TILE + 1 : 0;
    const top = floorAt(world, p.x, oldBottom, p.w, Math.max(dy, snap), !p.dropping);
    if (top !== Infinity) {
      const stepDown = top - oldBottom;
      p.y = top - p.h; p.vy = 0; p.grounded = true;
      if (stepDown > dy + .1) p.renderOffset -= stepDown;
    } else p.y += dy;
  } else if (!collides(world, p.x, p.y + dy, p.w, p.h)) p.y += dy;
  else { p.y = (Math.floor((p.y + dy) / TILE) + 1) * TILE; p.vy = 0; p.hold = 0; }
  p.x = Math.max(TILE, Math.min((WIDTH - 1) * TILE - p.w, p.x));
  p.y = Math.max(0, Math.min((HEIGHT - 2) * TILE - p.h, p.y));
  p.walk += Math.abs(p.vx) * dt;
  p.renderOffset *= Math.exp(-18 * dt);
  return { jumped, landed: !wasGrounded && p.grounded };
}
export function safeSpawn(p, world) {
  if (collides(world, p.x, p.y, p.w, p.h)) {
    p.x = world.spawn.x; p.y = world.spawn.y; p.vx = p.vy = 0;
    for (let y = Math.floor(p.y / TILE); y <= Math.floor((p.y + p.h) / TILE); y++) for (let x = Math.floor(p.x / TILE); x <= Math.floor((p.x + p.w) / TILE); x++) {
      if (world.get(x, y) !== BLOCK.BEDROCK) world.set(x, y, BLOCK.AIR);
    }
  }
}
