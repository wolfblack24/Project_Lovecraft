import { useEffect, useRef } from 'react';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<any>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    // ============================================================
    // CONSTANTS & BALANCE (adjust these for tuning)
    // ============================================================
    const INTERNAL_W = 320;
    const INTERNAL_H = 180;
    const GROUND_Y = 145; // ground line
    const GRAVITY = 0.4;
    const FPS = 60;
    const FRAME_TIME = 1000 / FPS;

    // Player balance
    const PLAYER_SPEED = 1.2;
    const PLAYER_JUMP_FORCE = -4.5;
    const PLAYER_MAX_HP = 100;
    const PLAYER_SPECIAL_COST = 20; // HP cost for special
    const PLAYER_SPECIAL_DMG = 35;
    const PLAYER_DODGE_SPEED = 3;
    const PLAYER_DODGE_FRAMES = 16;
    const PLAYER_DODGE_INVULN = 10;
    const PLAYER_COMBO_WINDOW = 20; // frames to chain next hit

    // Attack frame data [startup, active, recovery]
    const ATK_LIGHT1 = { startup: 4, active: 4, recovery: 8, damage: 8, knockback: 2, hitstop: 3 };
    const ATK_LIGHT2 = { startup: 3, active: 4, recovery: 8, damage: 10, knockback: 3, hitstop: 3 };
    const ATK_FINISH = { startup: 6, active: 5, recovery: 14, damage: 20, knockback: 6, hitstop: 6 };
    const ATK_HEAVY = { startup: 10, active: 6, recovery: 16, damage: 25, knockback: 5, hitstop: 5 };
    const ATK_AIR = { startup: 3, active: 6, recovery: 6, damage: 15, knockback: 3, hitstop: 4 };
    const ATK_WEAPON = { startup: 5, active: 5, recovery: 10, damage: 18, knockback: 4, hitstop: 4 };

    // Enemy balance
    const ZOMBIE_HP = 30;
    const ZOMBIE_SPEED = 0.4;
    const ZOMBIE_DMG = 8;
    const ZOMBIE_ATK_FRAMES = { startup: 12, active: 6, recovery: 20 };

    const CULTIST_HP = 25;
    const CULTIST_SPEED = 0.8;
    const CULTIST_DMG = 6;
    const CULTIST_ATK_FRAMES = { startup: 6, active: 4, recovery: 10 };

    const BOSS_HP = 200;
    const BOSS_SPEED = 0.5;
    const BOSS_DMG = 15;
    const BOSS_ATK_FRAMES = { startup: 18, active: 8, recovery: 24 };

    // Weapon
    const WEAPON_USES = 8;

    // ============================================================
    // PALETTE (16 colors max)
    // ============================================================
    const PAL = {
      black: '#0a0a0f',
      darkPurple: '#1a0a2e',
      deepRed: '#5c0a0a',
      blood: '#8b1a1a',
      brightRed: '#cc2222',
      crimson: '#ff3333',
      darkGray: '#2a2a3a',
      gray: '#4a4a5a',
      lightGray: '#8888aa',
      paleGray: '#bbbbaa',
      purple: '#6a2c8a',
      darkBlue: '#1a1a3a',
      blueGray: '#3a4a5a',
      green: '#2a5a2a',
      yellow: '#ccaa22',
      white: '#eeeeff',
    };

    // ============================================================
    // CANVAS SETUP
    // ============================================================
    const canvas = cvs;
    const ctx = canvas.getContext('2d')!;
    canvas.width = INTERNAL_W;
    canvas.height = INTERNAL_H;
    ctx.imageSmoothingEnabled = false;

    // Scale canvas to fit screen
    function resizeCanvas() {
      const scaleX = window.innerWidth / INTERNAL_W;
      const scaleY = window.innerHeight / INTERNAL_H;
      const scale = Math.floor(Math.min(scaleX, scaleY)) || 1;
      canvas.style.width = `${INTERNAL_W * scale}px`;
      canvas.style.height = `${INTERNAL_H * scale}px`;
      canvas.style.position = 'absolute';
      canvas.style.left = `${(window.innerWidth - INTERNAL_W * scale) / 2}px`;
      canvas.style.top = `${(window.innerHeight - INTERNAL_H * scale) / 2}px`;
      canvas.style.imageRendering = 'pixelated';
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // ============================================================
    // INPUT SYSTEM
    // ============================================================
    const keys: Record<string, boolean> = {};
    const keysJustPressed: Record<string, boolean> = {};
    let keysThisFrame: Record<string, boolean> = {};

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!keys[k]) keysThisFrame[k] = true;
      keys[k] = true;
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });

    // Gamepad
    let gamepadConnected = false;
    const gpState = { axes: [0, 0], buttons: {} as Record<string, boolean> };
    const gpJustPressed: Record<string, boolean> = {};
    let gpButtonsPrev: Record<string, boolean> = {};

    window.addEventListener('gamepadconnected', () => { gamepadConnected = true; });
    window.addEventListener('gamepaddisconnected', () => { gamepadConnected = false; });

    function pollGamepad() {
      if (!gamepadConnected) return;
      const gp = navigator.getGamepads()[0];
      if (!gp) return;
      gpState.axes = [gp.axes[0] || 0, gp.axes[1] || 0];
      const btnMap: Record<number, string> = { 0: 'j', 1: 'k', 2: 'l', 3: 'i', 9: 'enter', 6: 'p' };
      const newBtns: Record<string, boolean> = {};
      for (const [idx, name] of Object.entries(btnMap)) {
        const pressed = gp.buttons[parseInt(idx)]?.pressed || false;
        newBtns[name] = pressed;
      }
      gpState.buttons = newBtns;
    }

    // BUG FIX: Separate edge detection from state polling
    // This ensures gamepad edges are only detected per logical update, not per render frame
    function pollGamepadEdges() {
      if (!gamepadConnected) return;
      const btnMap: Record<number, string> = { 0: 'j', 1: 'k', 2: 'l', 3: 'i', 9: 'enter', 6: 'p' };
      for (const [idx, name] of Object.entries(btnMap)) {
        const pressed = gpState.buttons[name] || false;
        gpJustPressed[name] = pressed && !gpButtonsPrev[name];
      }
      gpButtonsPrev = { ...gpState.buttons };
    }

    function isKeyDown(k: string): boolean {
      return keys[k] || gpState.buttons[k] || false;
    }
    function isKeyJustPressed(k: string): boolean {
      return keysThisFrame[k] || gpJustPressed[k] || false;
    }

    function getInputAxis(): [number, number] {
      let x = 0, y = 0;
      if (isKeyDown('arrowleft') || isKeyDown('a')) x -= 1;
      if (isKeyDown('arrowright') || isKeyDown('d')) x += 1;
      if (isKeyDown('arrowup') || isKeyDown('w')) y -= 1;
      if (isKeyDown('arrowdown') || isKeyDown('s')) y += 1;
      // Gamepad
      if (gamepadConnected) {
        const gp = navigator.getGamepads()[0];
        if (gp) {
          if (Math.abs(gp.axes[0]) > 0.3) x = gp.axes[0];
          if (Math.abs(gp.axes[1]) > 0.3) y = gp.axes[1];
        }
      }
      return [x, y];
    }

    // ============================================================
    // AUDIO SYSTEM (Web Audio API)
    // ============================================================
    let audioCtx: AudioContext | null = null;
    let masterGain: GainNode | null = null;
    let muted = false;
    let musicPlaying = false;

    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.3;
      masterGain.connect(audioCtx.destination);
    }

    function playTone(freq: number, duration: number, type: OscillatorType = 'square', vol: number = 0.3, detune: number = 0) {
      if (!audioCtx || !masterGain || muted) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.1);
      osc.detune.value = detune;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    }

    function playNoise(duration: number, vol: number = 0.2) {
      if (!audioCtx || !masterGain || muted) return;
      const bufferSize = audioCtx.sampleRate * duration;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      source.connect(gain);
      gain.connect(masterGain);
      source.start();
    }

    function sfxHit() { playTone(150, 0.08, 'square', 0.4); playNoise(0.05, 0.3); }
    function sfxHeavyHit() { playTone(80, 0.15, 'sawtooth', 0.5); playNoise(0.1, 0.4); }
    function sfxDeath() { playTone(200, 0.1, 'square', 0.3); playTone(100, 0.2, 'sawtooth', 0.3); playNoise(0.15, 0.3); }
    function sfxJump() { playTone(300, 0.08, 'square', 0.2); playTone(450, 0.06, 'square', 0.15); }
    function sfxDodge() { playNoise(0.06, 0.15); }
    function sfxSpecial() { playTone(100, 0.3, 'sawtooth', 0.5); playTone(200, 0.2, 'square', 0.4); playNoise(0.2, 0.4); }
    function sfxPickup() { playTone(600, 0.05, 'square', 0.2); playTone(800, 0.08, 'square', 0.2); }
    function sfxBossWarn() { playTone(60, 0.5, 'sawtooth', 0.4); }

    // Simple chiptune music loop
    let musicInterval: number | null = null;
    const musicNotes = [
      // Dark minor melody
      [130.81, 0.2], [0, 0.1], [155.56, 0.2], [0, 0.1],
      [174.61, 0.3], [155.56, 0.2], [130.81, 0.4], [0, 0.2],
      [116.54, 0.2], [0, 0.1], [130.81, 0.2], [0, 0.1],
      [155.56, 0.3], [130.81, 0.2], [116.54, 0.4], [0, 0.2],
    ];
    let musicIdx = 0;

    function startMusic() {
      if (musicPlaying || muted) return;
      musicPlaying = true;
      musicIdx = 0;
      function playNext() {
        if (!musicPlaying || muted) return;
        const [freq, dur] = musicNotes[musicIdx % musicNotes.length];
        if (freq > 0) playTone(freq, dur * 0.8, 'square', 0.08);
        // Bass
        if (musicIdx % 4 === 0) playTone(freq > 0 ? freq / 2 : 65, dur * 0.6, 'triangle', 0.06);
        musicIdx++;
        musicInterval = window.setTimeout(playNext, dur * 400);
      }
      playNext();
    }

    function stopMusic() {
      musicPlaying = false;
      if (musicInterval) clearTimeout(musicInterval);
    }

    // ============================================================
    // GAME STATE
    // ============================================================
    type GameState = 'title' | 'playing' | 'gameover' | 'victory' | 'paused';
    let state: GameState = 'title';
    let score = 0;
    let combo = 0;
    let comboTimer = 0;
    let frameCount = 0;
    let hitstopFrames = 0;
    let screenShake = { x: 0, y: 0, intensity: 0 };
    let crtEnabled = false;
    let cameraX = 0;
    let cameraTargetX = 0;
    let currentArena = 0;
    let arenaCleared = [false, false, false];
    let showGoSign = false;
    let goSignTimer = 0;
    // Arena limpa: a câmera é liberada e o jogador anda até o gatilho da próxima arena
    let advancing = false;
    const NEXT_ARENA_TRIGGER = 60; // px dentro da próxima arena em que a câmera trava e os inimigos surgem

    // Arena boundaries
    const ARENA_WIDTH = 400;
    const ARENAS = [
      { x: 0, w: ARENA_WIDTH },
      { x: ARENA_WIDTH, w: ARENA_WIDTH },
      { x: ARENA_WIDTH * 2, w: ARENA_WIDTH + 80 },
    ];

    // ============================================================
    // ENTITIES
    // ============================================================
    interface Entity {
      x: number; y: number; z: number; // z = depth (y-axis in 2.5D)
      vx: number; vy: number; vz: number;
      w: number; h: number;
      facing: number; // 1 = right, -1 = left
      hp: number; maxHp: number;
      state: string;
      stateTimer: number;
      flashTimer: number;
      dead: boolean;
      deathTimer: number;
    }

    interface Player extends Entity {
      comboStep: number;
      comboBuffer: number;
      attackData: typeof ATK_LIGHT1 | null;
      attackFrame: number;
      attackPhase: 'startup' | 'active' | 'recovery' | null;
      isJumping: boolean;
      isDodging: boolean;
      dodgeTimer: number;
      invulnTimer: number;
      specialCooldown: number;
      hasWeapon: boolean;
      weaponUses: number;
      squashX: number;
      squashY: number;
      hitConnected: boolean;
      inputBuffer: { action: string; timer: number } | null;
    }

    interface Enemy extends Entity {
      type: 'zombie' | 'cultist' | 'boss';
      aiState: string;
      aiTimer: number;
      attackToken: boolean;
      bossPhase: number;
      bossTelegraph: number;
      bossPattern: number;
      knockbackVx: number;
      knockbackVy: number;
    }

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      life: number; maxLife: number;
      color: string; size: number;
      type: 'blood' | 'spark' | 'dust';
    }

    interface BloodPool {
      x: number; z: number; size: number; alpha: number;
    }

    interface Pickup {
      x: number; z: number; type: 'weapon';
      bobTimer: number;
    }

    let player: Player;
    let enemies: Enemy[] = [];
    let particles: Particle[] = [];
    let bloodPools: BloodPool[] = [];
    let pickups: Pickup[] = [];
    let attackTokens = 0;
    const MAX_ATTACK_TOKENS = 2;

    // ============================================================
    // INIT / RESET
    // ============================================================
    function createPlayer(): Player {
      return {
        x: 50, y: 0, z: GROUND_Y - 10,
        vx: 0, vy: 0, vz: 0,
        w: 12, h: 24,
        facing: 1,
        hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
        state: 'idle',
        stateTimer: 0,
        flashTimer: 0,
        dead: false,
        deathTimer: 0,
        comboStep: 0,
        comboBuffer: 0,
        attackData: null,
        attackFrame: 0,
        attackPhase: null,
        isJumping: false,
        isDodging: false,
        dodgeTimer: 0,
        invulnTimer: 0,
        specialCooldown: 0,
        hasWeapon: false,
        weaponUses: 0,
        squashX: 1, squashY: 1,
        hitConnected: false,
        inputBuffer: null,
      };
    }

    function createEnemy(type: 'zombie' | 'cultist' | 'boss', x: number, z: number): Enemy {
      const configs = {
        zombie: { hp: ZOMBIE_HP, w: 12, h: 22, speed: ZOMBIE_SPEED },
        cultist: { hp: CULTIST_HP, w: 10, h: 22, speed: CULTIST_SPEED },
        boss: { hp: BOSS_HP, w: 20, h: 32, speed: BOSS_SPEED },
      };
      const c = configs[type];
      return {
        x, y: 0, z,
        vx: 0, vy: 0, vz: 0,
        w: c.w, h: c.h,
        facing: -1,
        hp: c.hp, maxHp: c.hp,
        state: 'idle',
        stateTimer: 30 + Math.random() * 30, // Reduzido para resposta mais rápida
        flashTimer: 0,
        dead: false,
        deathTimer: 0,
        type,
        aiState: 'idle',
        aiTimer: 15 + Math.random() * 30, // Reduzido para resposta mais rápida
        attackToken: false,
        bossPhase: 1,
        bossTelegraph: 0,
        bossPattern: 0,
        knockbackVx: 0,
        knockbackVy: 0,
      };
    }

    function resetGame() {
      player = createPlayer();
      enemies = [];
      particles = [];
      bloodPools = [];
      pickups = [];
      score = 0;
      combo = 0;
      comboTimer = 0;
      hitstopFrames = 0;
      screenShake = { x: 0, y: 0, intensity: 0 };
      cameraX = 0;
      cameraTargetX = 0;
      currentArena = 0;
      arenaCleared = [false, false, false];
      showGoSign = false;
      goSignTimer = 0;
      advancing = false;
      attackTokens = 0;
      spawnArenaEnemies(0);
    }

    function spawnArenaEnemies(arena: number) {
      if (arena === 0) {
        // Wave 1: zombies
        for (let i = 0; i < 4; i++) {
          enemies.push(createEnemy('zombie', ARENAS[0].x + 200 + i * 40, GROUND_Y - 10 + (i % 2) * 20 - 10));
        }
      } else if (arena === 1) {
        // Wave 2: mix
        for (let i = 0; i < 2; i++) {
          enemies.push(createEnemy('zombie', ARENAS[1].x + 150 + i * 50, GROUND_Y - 10 + i * 15));
        }
        for (let i = 0; i < 2; i++) {
          enemies.push(createEnemy('cultist', ARENAS[1].x + 250 + i * 40, GROUND_Y - 10 - i * 10));
        }
        // Drop weapon
        pickups.push({ x: ARENAS[1].x + 200, z: GROUND_Y - 5, type: 'weapon', bobTimer: 0 });
      } else if (arena === 2) {
        // Boss arena
        enemies.push(createEnemy('boss', ARENAS[2].x + 280, GROUND_Y - 12));
      }
    }

    // ============================================================
    // COMBAT SYSTEM
    // ============================================================
    function startAttack(atkData: typeof ATK_LIGHT1) {
      player.attackData = atkData;
      player.attackFrame = 0;
      player.attackPhase = 'startup';
      player.state = 'attacking';
      player.hitConnected = false;
      player.squashX = 0.8;
      player.squashY = 1.2;
    }

    function getAttackHitbox(): { x: number; y: number; w: number; h: number } | null {
      if (player.attackPhase !== 'active') return null;
      const reach = player.hasWeapon ? 22 : 16;
      return {
        x: player.x + (player.facing > 0 ? 6 : -reach - 2),
        y: player.z - player.h / 2,
        w: reach,
        h: player.h * 0.6,
      };
    }

    function getEnemyHitbox(e: Enemy): { x: number; y: number; w: number; h: number } {
      return { x: e.x - e.w / 2, y: e.z - e.h, w: e.w, h: e.h };
    }

    function boxOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function dealDamageToEnemy(enemy: Enemy, damage: number, knockback: number, hitstop: number) {
      enemy.hp -= damage;
      enemy.flashTimer = 4;
      enemy.knockbackVx = player.facing * knockback;
      enemy.knockbackVy = -knockback * 0.5;

      // BUG FIX #6: Stun the enemy when hit (interrupts their attack)
      if (!enemy.dead) {
        enemy.aiState = 'stunned';
        // Stun duration proportional to damage, minimum 12 frames
        enemy.aiTimer = Math.max(12, Math.floor(damage * 1.5));
        // Release attack token if they had one (interrupted mid-attack)
        if (enemy.attackToken) {
          attackTokens--;
          enemy.attackToken = false;
        }
      }

      // Hitstop
      hitstopFrames = hitstop;

      // Screenshake
      screenShake.intensity = Math.min(hitstop * 1.5, 6);

      // Particles
      for (let i = 0; i < 5 + damage / 3; i++) {
        particles.push({
          x: enemy.x, y: enemy.z - enemy.h / 2,
          vx: (Math.random() - 0.3) * 3 * player.facing,
          vy: -(Math.random() * 3 + 1),
          life: 20 + Math.random() * 15,
          maxLife: 35,
          color: Math.random() > 0.3 ? PAL.blood : PAL.crimson,
          size: 1 + Math.random() * 2,
          type: 'blood',
        });
      }

      // Sound
      if (damage >= 20) sfxHeavyHit(); else sfxHit();

      // Combo
      combo++;
      comboTimer = 90;
      score += damage * combo;

      // Check death
      if (enemy.hp <= 0) {
        enemy.dead = true;
        enemy.deathTimer = 60; // Aumentado de 30 para 60 para dar tempo do voo
        sfxDeath();
        score += 100;

        // Extra knockback on death for finishers
        if (damage >= 18) {
          enemy.knockbackVx = player.facing * 8;
          enemy.knockbackVy = -2.5; // Reduzido de -5 para -2.5 para voo mais curto
        }

        // Blood pool
        bloodPools.push({ x: enemy.x, z: enemy.z, size: enemy.w * 0.8, alpha: 0.7 });
      }

      // Boss phase check
      if (enemy.type === 'boss' && enemy.hp <= enemy.maxHp * 0.5 && enemy.bossPhase === 1) {
        enemy.bossPhase = 2;
        enemy.aiState = 'telegraph';
        enemy.bossTelegraph = 60;
        sfxBossWarn();
        screenShake.intensity = 8;
      }
    }

    function dealDamageToPlayer(damage: number) {
      if (player.invulnTimer > 0 || player.isDodging) return;
      player.hp -= damage;
      player.flashTimer = 6;
      player.invulnTimer = 30;
      screenShake.intensity = 4;
      hitstopFrames = 2;

      // Blood particles on player
      for (let i = 0; i < 3; i++) {
        particles.push({
          x: player.x, y: player.z - player.h / 2,
          vx: (Math.random() - 0.5) * 2,
          vy: -(Math.random() * 2 + 1),
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: PAL.blood,
          size: 1.5,
          type: 'blood',
        });
      }

      if (player.hp <= 0) {
        player.dead = true;
        player.deathTimer = 60;
      }
    }

    // ============================================================
    // ENEMY AI
    // ============================================================
    function updateEnemyAI(e: Enemy, dt: number) {
      // BUG FIX #4: Process knockback physics BEFORE checking if dead
      // This allows dead enemies to fly through the air
      const hasKnockback = Math.abs(e.knockbackVx) > 0.1 || e.y < 0;
      if (hasKnockback) {
        // BUG FIX #3: Separate horizontal knockback from vertical gravity
        // Horizontal knockback decays, but gravity ALWAYS applies when airborne
        e.x += e.knockbackVx;
        if (Math.abs(e.knockbackVx) > 0.1) {
          e.knockbackVx *= 0.85;
        } else {
          e.knockbackVx = 0;
        }
        // Vertical: always apply gravity when in the air
        e.y += e.knockbackVy;
        e.knockbackVy += GRAVITY * 0.5;
        // Bounce on landing for death knockback effect
        if (e.y >= 0) {
          if (e.dead && Math.abs(e.knockbackVy) > 1) {
            // Bounce!
            e.y = 0;
            e.knockbackVy = -e.knockbackVy * 0.3;
          } else {
            e.y = 0;
            e.knockbackVy = 0;
          }
        }
        // During knockback, can't act (but dead enemies still need to animate)
        if (!e.dead) return;
      }

      // BUG FIX #5: Release attack token when enemy dies
      if (e.dead) {
        if (e.attackToken) {
          attackTokens--;
          e.attackToken = false;
        }
        return;
      }

      const distToPlayer = Math.abs(e.x - player.x);
      const zDist = Math.abs(e.z - player.z);
      const inRange = distToPlayer < (e.type === 'boss' ? 35 : 20);
      const zInRange = zDist < 12;

      // Face player (not during stun)
      if (e.aiState !== 'stunned') {
        e.facing = player.x > e.x ? 1 : -1;
      }

      // BUG FIX #6: Stun state - enemy is interrupted when hit
      if (e.aiState === 'stunned') {
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiState = 'idle';
          e.aiTimer = 15 + Math.random() * 20;
        }
        return;
      }

      e.aiTimer -= dt;

      switch (e.aiState) {
        case 'idle':
          if (e.aiTimer <= 0) {
            if (distToPlayer > 60) {
              e.aiState = 'chase';
              e.aiTimer = 30 + Math.random() * 30; // Reduzido de 60-120 para 30-60
            } else if (inRange && zInRange) {
              if (attackTokens < MAX_ATTACK_TOKENS) {
                e.aiState = 'prepare_attack';
                e.aiTimer = e.type === 'boss' ? 15 : 8; // Reduzido para resposta mais rápida
                attackTokens++;
                e.attackToken = true;
              } else {
                e.aiTimer = 8; // Wait for token (reduzido de 10)
              }
            } else {
              e.aiState = 'chase';
              e.aiTimer = 30 + Math.random() * 30; // Reduzido de 60-120 para 30-60
            }
          }
          break;

        case 'chase':
          {
            const speed = e.type === 'cultist' ? CULTIST_SPEED : (e.type === 'boss' ? BOSS_SPEED : ZOMBIE_SPEED);
            const spd = e.bossPhase === 2 ? speed * 1.5 : speed;
            if (distToPlayer > 18) {
              e.x += (player.x > e.x ? 1 : -1) * spd;
            }
            if (zDist > 8) {
              e.z += (player.z > e.z ? 1 : -1) * spd * 0.5;
            }
            // Cultist strafe
            if (e.type === 'cultist' && distToPlayer < 40 && distToPlayer > 20) {
              e.x += (Math.sin(frameCount * 0.1) * 0.5);
            }
            if (inRange && zInRange) {
              // Request attack token
              if (attackTokens < MAX_ATTACK_TOKENS) {
                e.aiState = 'prepare_attack';
                e.aiTimer = e.type === 'boss' ? (e.bossPhase === 2 ? 15 : 25) : 10;
                attackTokens++;
                e.attackToken = true;
              }
            }
            if (e.aiTimer <= 0 && !inRange) {
              e.aiState = 'idle';
              e.aiTimer = 20 + Math.random() * 30;
            }
          }
          break;

        case 'prepare_attack':
          // Telegraph for boss
          if (e.type === 'boss') {
            e.bossTelegraph = e.aiTimer;
          }
          if (e.aiTimer <= 0) {
            e.aiState = 'attacking';
            const atkFrames = e.type === 'zombie' ? ZOMBIE_ATK_FRAMES :
              (e.type === 'cultist' ? CULTIST_ATK_FRAMES : BOSS_ATK_FRAMES);
            e.stateTimer = atkFrames.startup + atkFrames.active + atkFrames.recovery;
          }
          break;

        case 'attacking':
          e.stateTimer -= dt;
          {
            const atkFrames = e.type === 'zombie' ? ZOMBIE_ATK_FRAMES :
              (e.type === 'cultist' ? CULTIST_ATK_FRAMES : BOSS_ATK_FRAMES);
            const totalFrames = atkFrames.startup + atkFrames.active + atkFrames.recovery;
            const elapsed = totalFrames - e.stateTimer;
            // Active frames - check hit
            if (elapsed >= atkFrames.startup && elapsed < atkFrames.startup + atkFrames.active) {
              const atkBox = {
                x: e.x + (e.facing > 0 ? 0 : -(e.type === 'boss' ? 25 : 15)),
                y: e.z - e.h,
                w: e.type === 'boss' ? 25 : 15,
                h: e.h * 0.7,
              };
              const playerBox = { x: player.x - player.w / 2, y: player.z - player.h, w: player.w, h: player.h };
              if (boxOverlap(atkBox, playerBox)) {
                const dmg = e.type === 'zombie' ? ZOMBIE_DMG : (e.type === 'cultist' ? CULTIST_DMG : BOSS_DMG);
                dealDamageToPlayer(e.bossPhase === 2 ? dmg * 1.3 : dmg);
                // Only hit once per attack
                e.stateTimer = atkFrames.recovery; // Skip to recovery
              }
            }
            if (e.stateTimer <= 0) {
              e.aiState = 'recover';
              e.aiTimer = 20 + Math.random() * 20;
              if (e.attackToken) { attackTokens--; e.attackToken = false; }
            }
          }
          break;

        case 'recover':
          if (e.type === 'cultist') {
            // Cultist retreats
            e.x -= e.facing * CULTIST_SPEED * 0.5;
          }
          if (e.aiTimer <= 0) {
            e.aiState = 'idle';
            e.aiTimer = 20 + Math.random() * 40;
          }
          break;

        case 'telegraph':
          // Boss phase transition
          e.bossTelegraph -= dt;
          screenShake.intensity = 3;
          if (e.bossTelegraph <= 0) {
            e.aiState = 'idle';
            e.aiTimer = 10;
          }
          break;
      }
    }

    // ============================================================
    // PLAYER UPDATE
    // ============================================================
    function updatePlayer(dt: number) {
      if (player.dead) {
        player.deathTimer -= dt;
        if (player.deathTimer <= 0) {
          state = 'gameover';
        }
        return;
      }

      // Squash & stretch recovery
      player.squashX += (1 - player.squashX) * 0.2;
      player.squashY += (1 - player.squashY) * 0.2;

      // Invulnerability
      if (player.invulnTimer > 0) player.invulnTimer -= dt;
      if (player.flashTimer > 0) player.flashTimer -= dt;
      if (player.specialCooldown > 0) player.specialCooldown -= dt;

      // Combo timer
      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) combo = 0;
      }

      // Combo buffer countdown (window to chain next attack)
      if (player.comboBuffer > 0) {
        player.comboBuffer -= dt;
        if (player.comboBuffer <= 0) {
          player.comboBuffer = 0;
          player.comboStep = 0;
        }
      }

      // BUG FIX #7: Process gravity FIRST (before any returns)
      // This prevents the player from freezing in the air during attacks
      if (player.isJumping) {
        player.vy += GRAVITY;
        player.y += player.vy;
        if (player.y >= 0) {
          player.y = 0;
          player.vy = 0;
          player.isJumping = false;
          player.squashX = 0.7;
          player.squashY = 1.3;
          // Dust
          for (let i = 0; i < 3; i++) {
            particles.push({
              x: player.x + (Math.random() - 0.5) * 8,
              y: player.z,
              vx: (Math.random() - 0.5) * 1.5,
              vy: -(Math.random() * 1),
              life: 10 + Math.random() * 8,
              maxLife: 18,
              color: PAL.gray,
              size: 1.5,
              type: 'dust',
            });
          }
        }
      }

      // Dodge
      if (player.isDodging) {
        player.dodgeTimer -= dt;
        player.x += player.facing * PLAYER_DODGE_SPEED;
        if (player.dodgeTimer <= 0) {
          player.isDodging = false;
          player.invulnTimer = 0;
        }
        applyArenaBounds();
        return;
      }

      // Attack in progress
      if (player.attackPhase) {
        player.attackFrame += dt;
        const atk = player.attackData!;
        if (player.attackPhase === 'startup' && player.attackFrame >= atk.startup) {
          player.attackPhase = 'active';
          player.attackFrame = 0;
        } else if (player.attackPhase === 'active') {
          // Check hits
          if (!player.hitConnected) {
            const hitbox = getAttackHitbox();
            if (hitbox) {
              for (const e of enemies) {
                if (e.dead) continue;
                const ebox = getEnemyHitbox(e);
                if (boxOverlap(hitbox, ebox)) {
                  player.hitConnected = true;
                  const dmg = player.hasWeapon && player.attackData === ATK_WEAPON ? ATK_WEAPON.damage : atk.damage;
                  dealDamageToEnemy(e, dmg, atk.knockback, atk.hitstop);
                  if (player.hasWeapon) {
                    player.weaponUses--;
                    if (player.weaponUses <= 0) player.hasWeapon = false;
                  }
                  break;
                }
              }
            }
          }
          if (player.attackFrame >= atk.active) {
            player.attackPhase = 'recovery';
            player.attackFrame = 0;
          }
        } else if (player.attackPhase === 'recovery') {
          if (player.attackFrame >= atk.recovery) {
            player.attackPhase = null;
            player.attackData = null;
            player.state = 'idle';
            // Consome o buffer UMA vez. Sem limpar, o golpe seguinte via o mesmo
            // buffer de novo e o jogador ficava atacando para sempre.
            const queued = player.inputBuffer !== null && player.inputBuffer.timer > 0;
            player.inputBuffer = null;
            if (queued) processAttackInput();
          }
        }

        // Qualquer J apertado durante o golpe entra na fila (1 vaga) e é
        // consumido no fim do recovery.
        if (isKeyJustPressed('j')) {
          player.inputBuffer = { action: 'attack', timer: 10 };
        }

        // Allow movement during attack (reduced)
        const [ax] = getInputAxis();
        if (Math.abs(ax) > 0.1) {
          player.x += ax * PLAYER_SPEED * 0.3;
          player.facing = ax > 0 ? 1 : -1;
        }
        applyArenaBounds();
        return;
      }

      // Input buffer countdown
      if (player.inputBuffer) {
        player.inputBuffer.timer -= dt;
        if (player.inputBuffer.timer <= 0) player.inputBuffer = null;
      }

      // Movement
      const [mx, my] = getInputAxis();
      if (Math.abs(mx) > 0.1) {
        player.x += mx * PLAYER_SPEED;
        player.facing = mx > 0 ? 1 : -1;
      }
      if (Math.abs(my) > 0.1) {
        player.z += my * PLAYER_SPEED * 0.6;
        player.z = Math.max(GROUND_Y - 30, Math.min(GROUND_Y + 10, player.z));
      }

      // Jump
      if (isKeyJustPressed('k') && !player.isJumping) {
        player.vy = PLAYER_JUMP_FORCE;
        player.isJumping = true;
        player.squashX = 1.3;
        player.squashY = 0.7;
        sfxJump();
      }

      // Gravity is processed at the top of updatePlayer (before attack logic)
      // to fix bug #7 (air attack freeze)

      // Attack input
      if (isKeyJustPressed('j')) {
        processAttackInput();
      }

      // Dodge
      if (isKeyJustPressed('l') && !player.isJumping) {
        player.isDodging = true;
        player.dodgeTimer = PLAYER_DODGE_FRAMES;
        player.invulnTimer = PLAYER_DODGE_INVULN;
        player.squashX = 1.4;
        player.squashY = 0.6;
        sfxDodge();
      }

      // Special
      if (isKeyJustPressed('i') && player.specialCooldown <= 0 && player.hp > PLAYER_SPECIAL_COST) {
        player.hp -= PLAYER_SPECIAL_COST;
        player.specialCooldown = 120;
        sfxSpecial();
        screenShake.intensity = 6;
        hitstopFrames = 4;

        // Damage all nearby enemies
        for (const e of enemies) {
          if (e.dead) continue;
          const dist = Math.abs(e.x - player.x) + Math.abs(e.z - player.z);
          if (dist < 60) {
            dealDamageToEnemy(e, PLAYER_SPECIAL_DMG, 5, 5);
          }
        }

        // Special particles
        for (let i = 0; i < 20; i++) {
          const angle = (i / 20) * Math.PI * 2;
          particles.push({
            x: player.x, y: player.z - player.h / 2,
            vx: Math.cos(angle) * 3,
            vy: Math.sin(angle) * 3 - 1,
            life: 20 + Math.random() * 10,
            maxLife: 30,
            color: PAL.crimson,
            size: 2 + Math.random() * 2,
            type: 'spark',
          });
        }
      }

      // Pickup
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        if (Math.abs(player.x - p.x) < 12 && Math.abs(player.z - p.z) < 10) {
          player.hasWeapon = true;
          player.weaponUses = WEAPON_USES;
          pickups.splice(i, 1);
          sfxPickup();
        }
      }

      applyArenaBounds();
    }

    // Limites de movimento + transição de arena.
    // Luta em andamento: jogador preso na arena atual.
    // Arena limpa (advancing): sem parede à direita, o jogador anda de verdade até a
    // próxima arena; ao cruzar o gatilho a câmera trava e os inimigos surgem.
    function applyArenaBounds() {
      const arena = ARENAS[currentArena];
      if (advancing) {
        const next = ARENAS[currentArena + 1];
        player.x = Math.max(cameraX + 8, Math.min(next.x + next.w - 8, player.x));
        if (player.x >= next.x + NEXT_ARENA_TRIGGER) {
          currentArena++;
          advancing = false;
          showGoSign = false;
          spawnArenaEnemies(currentArena);
        }
      } else {
        player.x = Math.max(arena.x + 8, Math.min(arena.x + arena.w - 8, player.x));
      }
    }

    function processAttackInput() {
      if (player.attackPhase === 'recovery') {
        // Buffer the input
        player.inputBuffer = { action: 'attack', timer: 6 };
        return;
      }
      if (player.attackPhase) return;

      if (player.isJumping) {
        startAttack(ATK_AIR);
      } else if (player.hasWeapon) {
        startAttack(ATK_WEAPON);
      } else {
        // Combo system
        if (player.comboBuffer > 0) {
          player.comboStep++;
          if (player.comboStep >= 3) {
            startAttack(ATK_FINISH);
            player.comboStep = 0;
            player.comboBuffer = 0;
          } else if (player.comboStep === 2) {
            startAttack(ATK_LIGHT2);
            player.comboBuffer = PLAYER_COMBO_WINDOW;
          } else {
            startAttack(ATK_LIGHT1);
            player.comboBuffer = PLAYER_COMBO_WINDOW;
          }
        } else {
          player.comboStep = 1;
          startAttack(ATK_LIGHT1);
          player.comboBuffer = PLAYER_COMBO_WINDOW;
        }
      }
    }

    // ============================================================
    // PARTICLES & EFFECTS
    // ============================================================
    function updateParticles(dt: number) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.life -= dt;
        if (p.life <= 0) {
          // Blood hits ground -> pool
          if (p.type === 'blood' && p.y >= 0) {
            bloodPools.push({ x: p.x, z: p.y + GROUND_Y - 10, size: p.size, alpha: 0.5 });
          }
          particles.splice(i, 1);
        }
      }
      // Fade blood pools
      for (let i = bloodPools.length - 1; i >= 0; i--) {
        bloodPools[i].alpha -= 0.001;
        if (bloodPools[i].alpha <= 0) bloodPools.splice(i, 1);
      }
      // Limit pools
      if (bloodPools.length > 30) bloodPools.splice(0, bloodPools.length - 30);
    }

    function updateScreenShake() {
      if (screenShake.intensity > 0) {
        screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.intensity *= 0.85;
        if (screenShake.intensity < 0.3) screenShake.intensity = 0;
      } else {
        screenShake.x = 0;
        screenShake.y = 0;
      }
    }

    // ============================================================
    // CAMERA
    // ============================================================
    function updateCamera() {
      const arena = ARENAS[currentArena];
      let minX = arena.x;
      let maxX = arena.x + arena.w - INTERNAL_W;
      if (advancing) {
        // Câmera livre até o fim da próxima arena, mas nunca volta para trás
        const next = ARENAS[currentArena + 1];
        minX = Math.max(arena.x, cameraX);
        maxX = next.x + next.w - INTERNAL_W;
      }
      cameraTargetX = Math.max(minX, Math.min(maxX, player.x - INTERNAL_W / 2));
      cameraX += (cameraTargetX - cameraX) * 0.08;
    }

    // ============================================================
    // RENDERING
    // ============================================================
    function drawPixelRect(x: number, y: number, w: number, h: number, color: string) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
    }

    function drawParallax() {
      const cx = cameraX;
      // Sky gradient
      const grad = ctx.createLinearGradient(0, 0, 0, INTERNAL_H);
      grad.addColorStop(0, PAL.darkPurple);
      grad.addColorStop(0.5, PAL.darkBlue);
      grad.addColorStop(1, PAL.black);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

      // Moon (far layer)
      const moonX = 250 - cx * 0.05;
      ctx.fillStyle = PAL.paleGray;
      ctx.beginPath();
      ctx.arc(moonX, 30, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.darkPurple;
      ctx.beginPath();
      ctx.arc(moonX + 4, 28, 10, 0, Math.PI * 2);
      ctx.fill();

      // Far trees (parallax 0.2)
      ctx.fillStyle = PAL.darkGray;
      for (let i = 0; i < 24; i++) {
        const tx = i * 60 - cx * 0.2;
        if (tx > -20 && tx < INTERNAL_W + 20) {
          // Dead tree silhouette
          drawPixelRect(tx, 60, 3, 80, PAL.darkGray);
          drawPixelRect(tx - 6, 65, 4, 2, PAL.darkGray);
          drawPixelRect(tx - 8, 60, 3, 2, PAL.darkGray);
          drawPixelRect(tx + 3, 70, 5, 2, PAL.darkGray);
          drawPixelRect(tx + 6, 66, 3, 2, PAL.darkGray);
        }
      }

      // Mid layer - tombstones (parallax 0.5)
      ctx.fillStyle = PAL.gray;
      for (let i = 0; i < 20; i++) {
        const tx = i * 80 + 20 - cx * 0.5;
        if (tx > -15 && tx < INTERNAL_W + 15) {
          drawPixelRect(tx, GROUND_Y - 12, 8, 12, PAL.gray);
          drawPixelRect(tx + 1, GROUND_Y - 14, 6, 3, PAL.gray);
        }
      }

      // Fog layer
      ctx.fillStyle = 'rgba(60, 40, 80, 0.15)';
      for (let i = 0; i < 5; i++) {
        const fx = (i * 100 + frameCount * 0.2 - cx * 0.3) % (INTERNAL_W + 100) - 50;
        ctx.fillRect(fx, GROUND_Y - 20, 60, 15);
      }

      // Ground
      ctx.fillStyle = PAL.darkGray;
      ctx.fillRect(0, GROUND_Y, INTERNAL_W, INTERNAL_H - GROUND_Y);
      ctx.fillStyle = PAL.blueGray;
      ctx.fillRect(0, GROUND_Y, INTERNAL_W, 2);
    }

    function drawPlayer() {
      const sx = Math.floor(player.x - cameraX + screenShake.x);
      const sy = Math.floor(player.z + player.y + screenShake.y);

      // Flash white
      const flash = player.flashTimer > 0;
      const invulnBlink = player.invulnTimer > 0 && Math.floor(frameCount / 2) % 2 === 0;
      if (invulnBlink) return;

      const bodyColor = flash ? PAL.white : PAL.crimson;
      const skinColor = flash ? PAL.white : PAL.paleGray;
      const pantsColor = flash ? PAL.white : PAL.darkGray;

      // Squash & stretch
      const sw = player.w * player.squashX;
      const sh = player.h * player.squashY;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(player.facing, 1);

      // Dodge visual
      if (player.isDodging) {
        ctx.globalAlpha = 0.6;
        ctx.translate(0, -sh * 0.3);
      }

      // Body
      drawPixelRect(-sw / 2, -sh, sw, sh * 0.5, bodyColor);
      // Head
      drawPixelRect(-3, -sh - 6, 6, 6, skinColor);
      // Eyes
      if (!flash) {
        drawPixelRect(1, -sh - 4, 2, 2, PAL.crimson);
      }
      // Legs
      drawPixelRect(-sw / 2, -sh * 0.5, sw * 0.4, sh * 0.5, pantsColor);
      drawPixelRect(sw * 0.1, -sh * 0.5, sw * 0.4, sh * 0.5, pantsColor);

      // Attack arm
      if (player.attackPhase === 'active') {
        const armLen = player.hasWeapon ? 16 : 10;
        drawPixelRect(sw / 2, -sh * 0.7, armLen, 3, skinColor);
        if (player.hasWeapon) {
          drawPixelRect(sw / 2 + armLen - 2, -sh * 0.7 - 4, 3, 10, PAL.lightGray);
        }
      } else if (player.attackPhase === 'startup') {
        drawPixelRect(-sw / 2 - 4, -sh * 0.7, 5, 3, skinColor);
      }

      // Weapon on back
      if (player.hasWeapon && player.attackPhase !== 'active') {
        drawPixelRect(-2, -sh - 2, 2, 14, PAL.lightGray);
      }

      ctx.restore();
    }

    function drawEnemy(e: Enemy) {
      if (e.dead && e.deathTimer <= 0) return;

      const sx = Math.floor(e.x - cameraX + screenShake.x);
      const sy = Math.floor(e.z + e.y + screenShake.y);
      const flash = e.flashTimer > 0;

      if (e.dead) {
        ctx.globalAlpha = e.deathTimer / 30;
      }

      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(e.facing, 1);

      if (e.type === 'zombie') {
        const c1 = flash ? PAL.white : PAL.green;
        const c2 = flash ? PAL.white : PAL.darkGray;
        // Body
        drawPixelRect(-e.w / 2, -e.h, e.w, e.h * 0.6, c1);
        // Head
        drawPixelRect(-3, -e.h - 5, 6, 5, c1);
        drawPixelRect(1, -e.h - 3, 2, 2, PAL.crimson);
        // Legs
        drawPixelRect(-e.w / 2, -e.h * 0.4, 4, e.h * 0.4, c2);
        drawPixelRect(2, -e.h * 0.4, 4, e.h * 0.4, c2);
        // Arms reaching
        if (e.aiState === 'attacking' || e.aiState === 'prepare_attack') {
          drawPixelRect(e.w / 2, -e.h * 0.7, 8, 3, c1);
        }
      } else if (e.type === 'cultist') {
        const c1 = flash ? PAL.white : PAL.purple;
        const c2 = flash ? PAL.white : PAL.darkPurple;
        // Robe
        drawPixelRect(-e.w / 2, -e.h, e.w, e.h * 0.8, c1);
        drawPixelRect(-e.w / 2 - 1, -e.h * 0.3, e.w + 2, e.h * 0.3, c2);
        // Hood
        drawPixelRect(-4, -e.h - 4, 8, 6, c2);
        drawPixelRect(1, -e.h - 2, 2, 2, PAL.yellow);
        // Dagger
        if (e.aiState === 'attacking') {
          drawPixelRect(e.w / 2, -e.h * 0.6, 6, 2, PAL.lightGray);
        }
      } else if (e.type === 'boss') {
        const c1 = flash ? PAL.white : (e.bossPhase === 2 ? PAL.crimson : PAL.deepRed);
        const c2 = flash ? PAL.white : PAL.darkGray;
        const phase2 = e.bossPhase === 2;

        // Large body
        drawPixelRect(-e.w / 2, -e.h, e.w, e.h * 0.65, c1);
        // Head
        drawPixelRect(-5, -e.h - 8, 10, 8, c2);
        // Horns
        drawPixelRect(-6, -e.h - 12, 3, 5, c1);
        drawPixelRect(3, -e.h - 12, 3, 5, c1);
        // Eyes
        drawPixelRect(-2, -e.h - 5, 2, 2, phase2 ? PAL.yellow : PAL.crimson);
        drawPixelRect(2, -e.h - 5, 2, 2, phase2 ? PAL.yellow : PAL.crimson);
        // Legs
        drawPixelRect(-e.w / 2, -e.h * 0.35, 7, e.h * 0.35, c2);
        drawPixelRect(3, -e.h * 0.35, 7, e.h * 0.35, c2);

        // Telegraph warning
        if (e.aiState === 'prepare_attack' || e.bossTelegraph > 0) {
          ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.3) * 0.3;
          drawPixelRect(-e.w / 2 - 2, -e.h - 15, e.w + 4, 3, PAL.yellow);
          ctx.globalAlpha = 1;
        }

        // Phase 2 aura
        if (phase2 && frameCount % 4 < 2) {
          ctx.globalAlpha = 0.3;
          drawPixelRect(-e.w / 2 - 2, -e.h - 2, e.w + 4, e.h + 2, PAL.crimson);
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawParticles() {
      for (const p of particles) {
        const sx = p.x - cameraX + screenShake.x;
        const sy = p.y + GROUND_Y - 10 + screenShake.y;
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.floor(sx), Math.floor(sy), Math.ceil(p.size), Math.ceil(p.size));
      }
      ctx.globalAlpha = 1;
    }

    function drawBloodPools() {
      for (const bp of bloodPools) {
        const sx = bp.x - cameraX + screenShake.x;
        const sy = bp.z + screenShake.y;
        ctx.globalAlpha = bp.alpha;
        ctx.fillStyle = PAL.deepRed;
        ctx.fillRect(Math.floor(sx - bp.size / 2), Math.floor(sy - 1), Math.ceil(bp.size), 2);
      }
      ctx.globalAlpha = 1;
    }

    function drawPickups() {
      for (const p of pickups) {
        const sx = p.x - cameraX + screenShake.x;
        const sy = p.z + Math.sin(p.bobTimer * 0.05) * 2 + screenShake.y;
        // Axe
        drawPixelRect(sx - 1, sy - 10, 2, 10, PAL.lightGray);
        drawPixelRect(sx - 4, sy - 12, 8, 4, PAL.gray);
        // Glow
        ctx.globalAlpha = 0.3 + Math.sin(frameCount * 0.1) * 0.1;
        drawPixelRect(sx - 5, sy - 14, 10, 16, PAL.yellow);
        ctx.globalAlpha = 1;
      }
    }

    function drawHUD() {
      // Health bar
      ctx.fillStyle = PAL.darkGray;
      ctx.fillRect(8, 8, 60, 6);
      ctx.fillStyle = player.hp > 30 ? PAL.crimson : PAL.brightRed;
      ctx.fillRect(8, 8, 60 * (player.hp / player.maxHp), 6);
      ctx.strokeStyle = PAL.lightGray;
      ctx.lineWidth = 1;
      ctx.strokeRect(8, 8, 60, 6);

      // Special bar
      const specialPct = player.specialCooldown > 0 ? 1 - player.specialCooldown / 120 : 1;
      ctx.fillStyle = PAL.darkGray;
      ctx.fillRect(8, 16, 40, 4);
      ctx.fillStyle = PAL.purple;
      ctx.fillRect(8, 16, 40 * specialPct, 4);

      // HP text
      drawText(`${Math.ceil(player.hp)}`, 72, 8, PAL.white, 1);

      // Combo
      if (combo > 1) {
        const comboScale = 1 + Math.sin(frameCount * 0.2) * 0.1;
        ctx.save();
        ctx.translate(INTERNAL_W - 30, 12);
        ctx.scale(comboScale, comboScale);
        drawText(`${combo}x`, 0, 0, PAL.yellow, 1);
        ctx.restore();
      }

      // Score
      drawText(`${score}`, INTERNAL_W - 50, 22, PAL.paleGray, 1);

      // Weapon indicator
      if (player.hasWeapon) {
        drawText(`⚔${player.weaponUses}`, 8, 24, PAL.lightGray, 1);
      }

      // Boss health bar
      const boss = enemies.find(e => e.type === 'boss' && !e.dead);
      if (boss) {
        const bw = 120;
        const bx = (INTERNAL_W - bw) / 2;
        ctx.fillStyle = PAL.darkGray;
        ctx.fillRect(bx, INTERNAL_H - 14, bw, 6);
        ctx.fillStyle = boss.bossPhase === 2 ? PAL.crimson : PAL.deepRed;
        ctx.fillRect(bx, INTERNAL_H - 14, bw * (boss.hp / boss.maxHp), 6);
        ctx.strokeStyle = PAL.lightGray;
        ctx.strokeRect(bx, INTERNAL_H - 14, bw, 6);
        drawText('DEMON LORD', bx + bw / 2 - 22, INTERNAL_H - 22, PAL.crimson, 1);
      }

      // GO sign
      if (showGoSign) {
        const blink = Math.floor(frameCount / 15) % 2;
        if (blink) {
          drawText('GO →', INTERNAL_W - 46, INTERNAL_H / 2 - 30, PAL.yellow, 2);
        }
      }

      // Arena indicator
      drawText(`ARENA ${currentArena + 1}`, INTERNAL_W - 35, INTERNAL_H - 8, PAL.gray, 1);
    }

    function drawText(text: string, x: number, y: number, color: string, scale: number = 1) {
      ctx.fillStyle = color;
      ctx.font = `${6 * scale}px monospace`;
      ctx.fillText(text, Math.floor(x), Math.floor(y + 5 * scale));
    }

    function drawCRT() {
      if (!crtEnabled) return;
      // Scanlines
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let y = 0; y < INTERNAL_H; y += 2) {
        ctx.fillRect(0, y, INTERNAL_W, 1);
      }
      // Vignette
      const grad = ctx.createRadialGradient(INTERNAL_W / 2, INTERNAL_H / 2, INTERNAL_W * 0.3, INTERNAL_W / 2, INTERNAL_H / 2, INTERNAL_W * 0.7);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
    }

    function drawTitleScreen() {
      // Background
      ctx.fillStyle = PAL.black;
      ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

      // Title
      const titleY = 40 + Math.sin(frameCount * 0.03) * 3;
      drawText('CRIMSON', INTERNAL_W / 2 - 30, titleY, PAL.crimson, 3);
      drawText('GRAVE', INTERNAL_W / 2 - 20, titleY + 22, PAL.blood, 3);

      // Subtitle
      drawText('A Beat \'em Up Prototype', INTERNAL_W / 2 - 45, 90, PAL.lightGray, 1);

      // Controls
      const cy = 110;
      drawText('WASD/Arrows: Move', 60, cy, PAL.gray, 1);
      drawText('J: Attack  K: Jump', 60, cy + 10, PAL.gray, 1);
      drawText('L: Dodge  I: Special', 60, cy + 20, PAL.gray, 1);
      drawText('P: Pause  F: CRT', 60, cy + 30, PAL.gray, 1);
      drawText('Gamepad supported!', 60, cy + 40, PAL.purple, 1);

      // Start prompt
      const blink = Math.floor(frameCount / 20) % 2;
      if (blink) {
        drawText('PRESS ENTER TO START', INTERNAL_W / 2 - 48, INTERNAL_H - 20, PAL.yellow, 1);
      }

      // Decorative blood drips
      for (let i = 0; i < 8; i++) {
        const dx = 30 + i * 40;
        const dh = 10 + Math.sin(i + frameCount * 0.02) * 5;
        drawPixelRect(dx, 0, 2, dh, PAL.deepRed);
      }
    }

    function drawGameOver() {
      ctx.fillStyle = 'rgba(10, 0, 0, 0.8)';
      ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
      drawText('YOU DIED', INTERNAL_W / 2 - 24, 60, PAL.crimson, 3);
      drawText(`Score: ${score}`, INTERNAL_W / 2 - 20, 100, PAL.paleGray, 1);
      const blink = Math.floor(frameCount / 20) % 2;
      if (blink) drawText('PRESS ENTER TO RETRY', INTERNAL_W / 2 - 48, 130, PAL.yellow, 1);
    }

    function drawVictory() {
      ctx.fillStyle = 'rgba(0, 5, 10, 0.8)';
      ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
      drawText('VICTORY!', INTERNAL_W / 2 - 24, 50, PAL.yellow, 3);
      drawText('The demon lord is slain.', INTERNAL_W / 2 - 45, 85, PAL.paleGray, 1);
      drawText(`Final Score: ${score}`, INTERNAL_W / 2 - 28, 110, PAL.white, 1);
      drawText(`Max Combo: ${combo}x`, INTERNAL_W / 2 - 24, 125, PAL.lightGray, 1);
      const blink = Math.floor(frameCount / 20) % 2;
      if (blink) drawText('PRESS ENTER TO PLAY AGAIN', INTERNAL_W / 2 - 58, 150, PAL.yellow, 1);
    }

    function drawPause() {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
      drawText('PAUSED', INTERNAL_W / 2 - 18, INTERNAL_H / 2 - 5, PAL.white, 2);
      drawText('Press P to resume', INTERNAL_W / 2 - 30, INTERNAL_H / 2 + 15, PAL.gray, 1);
    }

    // ============================================================
    // MAIN UPDATE
    // ============================================================
    function update(dt: number) {
      frameCount++;

      // Toggle CRT
      if (isKeyJustPressed('f')) {
        crtEnabled = !crtEnabled;
      }

      // Toggle mute
      if (isKeyJustPressed('m')) {
        muted = !muted;
        if (muted) stopMusic();
        else if (state === 'playing') startMusic();
      }

      switch (state) {
        case 'title':
          if (isKeyJustPressed('enter')) {
            initAudio();
            resetGame();
            state = 'playing';
            startMusic();
          }
          break;

        case 'playing':
          if (isKeyJustPressed('p')) {
            state = 'paused';
            stopMusic();
            break;
          }

          // Hitstop
          if (hitstopFrames > 0) {
            hitstopFrames -= dt;
            updateScreenShake();
            // BUG FIX: Process player input during hitstop so attack buffer works
            // This allows players to queue the next attack during hitstop freeze
            if (!player.dead && !player.isDodging && player.attackPhase) {
              if (isKeyJustPressed('j')) {
                player.inputBuffer = { action: 'attack', timer: 10 };
              }
            }
            break; // Freeze game logic during hitstop
          }

          updatePlayer(dt);
          for (const e of enemies) {
            updateEnemyAI(e, dt);
            if (e.dead) {
              e.deathTimer -= dt;
            }
            if (e.flashTimer > 0) e.flashTimer -= dt;
          }
          // Remove dead enemies
          enemies = enemies.filter(e => !e.dead || e.deathTimer > 0);

          updateParticles(dt);
          updateScreenShake();
          updateCamera();

          // Update pickups
          for (const p of pickups) p.bobTimer += dt;

          // Check arena clear
          if (!arenaCleared[currentArena]) {
            const aliveEnemies = enemies.filter(e => !e.dead);
            if (aliveEnemies.length === 0) {
              arenaCleared[currentArena] = true;
              if (currentArena < 2) {
                showGoSign = true;
                advancing = true;
                goSignTimer = 0;
              } else {
                // Victory!
                state = 'victory';
                stopMusic();
              }
            }
          }

          // Check player death
          if (player.dead && player.deathTimer <= 0) {
            state = 'gameover';
            stopMusic();
          }
          break;

        case 'paused':
          if (isKeyJustPressed('p')) {
            state = 'playing';
            startMusic();
          }
          break;

        case 'gameover':
        case 'victory':
          if (isKeyJustPressed('enter')) {
            resetGame();
            state = 'playing';
            startMusic();
          }
          break;
      }
    }

    // ============================================================
    // MAIN RENDER
    // ============================================================
    function render() {
      ctx.clearRect(0, 0, INTERNAL_W, INTERNAL_H);

      if (state === 'title') {
        drawTitleScreen();
        drawCRT();
        return;
      }

      // Apply camera + shake
      ctx.save();
      ctx.translate(screenShake.x, screenShake.y);

      drawParallax();
      drawBloodPools();
      drawPickups();

      // Sort entities by z for proper depth
      const allEntities: { z: number; draw: () => void }[] = [];
      allEntities.push({ z: player.z, draw: drawPlayer });
      for (const e of enemies) {
        if (!e.dead || e.deathTimer > 0) {
          allEntities.push({ z: e.z, draw: () => drawEnemy(e) });
        }
      }
      allEntities.sort((a, b) => a.z - b.z);
      for (const ent of allEntities) ent.draw();

      drawParticles();
      ctx.restore();

      drawHUD();

      if (state === 'paused') drawPause();
      if (state === 'gameover') drawGameOver();
      if (state === 'victory') drawVictory();

      drawCRT();
    }

    // ============================================================
    // GAME LOOP (fixed timestep)
    // ============================================================
    let lastTime = 0;
    let accumulator = 0;
    let running = true;

    function gameLoop(timestamp: number) {
      if (!running) return;

      const delta = timestamp - lastTime;
      lastTime = timestamp;
      accumulator += Math.min(delta, 100); // Cap to prevent spiral of death

      // Poll gamepad state (can run every render frame)
      pollGamepad();

      // Fixed timestep updates
      // BUG FIX #1: Only clear input AFTER an update actually ran
      while (accumulator >= FRAME_TIME) {
        // BUG FIX: Detect gamepad edges per logical update, not per render
        pollGamepadEdges();
        
        update(1); // dt = 1 frame
        accumulator -= FRAME_TIME;
        
        // Clear just-pressed keys right after each logical update
        keysThisFrame = {};
        for (const k in gpJustPressed) gpJustPressed[k] = false;
      }

      render();

      requestAnimationFrame(gameLoop);
    }

    // Start
    requestAnimationFrame((ts) => {
      lastTime = ts;
      gameLoop(ts);
    });

    // Cleanup
    gameRef.current = { running: true };
    return () => {
      running = false;
      stopMusic();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <canvas
        ref={canvasRef}
        width={320}
        height={180}
        style={{
          imageRendering: 'pixelated',
          cursor: 'none',
        }}
      />
    </div>
  );
}
