import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Sound } from './audio';
import { MIT_TEXT, MUSIC_CREDITS, SOFTWARE_CREDITS, type Credit } from './credits';
import { Game, type Cue } from './game';
import { clearOwnMusic, loadOwnMusic, saveOwnMusic } from './musicStore';
import { addRecord, loadRecords } from './records';
import { Sensors } from './sensors';
import { loadSettings, saveSettings } from './settings';
import { log, startTelemetry } from './telemetry';
import { VALLEY } from './themes';
import { View } from './view';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

startTelemetry();

const sensors = new Sensors();
sensors.start();
const game = new Game(sensors);
const view = new View(game);
const sound = new Sound(VALLEY.music);
if (import.meta.env.DEV) (globalThis as unknown as { game: Game }).game = game;

const hud = $('hud');
const controls = $('controls');
const showHud = (on: boolean): void => {
  hud.hidden = !on;
  controls.hidden = !on;
};
const timeEl = $('time');
const speedEl = $('speed');
const meterFill = $('meterFill');
const jumpCue = $('jumpCue');
const jumpArrow = $('jumpArrow');
const jumpTimer = $('jumpTimer');
const jumpTimerFill = $('jumpTimerFill');
const callout = $('callout');
const menu = $('menu');
const menuText = $('menuText');
const lab = $('lab');
const labValue = $('labValue');
const labLive = $('labLive');
const labLog = $('labLog');

let calloutUntil = 0;
const showCallout = (text: string, color = '#4a3b52', seconds = 1.1): void => {
  callout.textContent = text;
  callout.style.color = color;
  callout.style.fontSize = text.length <= 2 ? '84px' : '';
  calloutUntil = performance.now() + seconds * 1000;
};

game.onCallout = (text, tone) => {
  const color = tone === 'good' ? '#2f9e6e' : tone === 'bad' ? '#c8443f' : tone === 'count' ? '#4a3b52' : '#ffffff';
  showCallout(text, color);
};
const HAPTICS: Partial<Record<Cue, ImpactStyle>> = {
  boost: ImpactStyle.Heavy,
  burst: ImpactStyle.Heavy,
  catch: ImpactStyle.Heavy,
  launch: ImpactStyle.Heavy,
  loop: ImpactStyle.Medium,
  hit: ImpactStyle.Heavy,
  land: ImpactStyle.Heavy,
  go: ImpactStyle.Heavy,
  softLand: ImpactStyle.Light,
  wall: ImpactStyle.Light,
  orb: ImpactStyle.Light,
  tick: ImpactStyle.Light,
  fall: ImpactStyle.Light,
};
game.onCue = (cue) => {
  sound.play(cue);
  const style = HAPTICS[cue];
  if (style) Haptics.impact({ style }).catch(() => {});
};
const courseId = game.course.data.id;
const showBest = (): void => {
  const best = loadRecords(courseId)[0];
  if (best) menuText.textContent = `Best ${best.time.toFixed(2)}`;
};
showBest();
game.onFinish = (time) => {
  const best = addRecord(courseId, time)[0];
  menuText.textContent = `Time ${time.toFixed(2)}   Best ${best.time.toFixed(2)}`;
  menu.hidden = false;
  showHud(false);
  callout.textContent = '';
};

// Pages opened from the menu, each with its own way back.
const page = (openId: string, pageId: string, closeId: string, from: HTMLElement, onOpen?: () => void): void => {
  const el = $(pageId);
  $(openId).addEventListener('click', () => {
    onOpen?.();
    from.hidden = true;
    el.hidden = false;
    el.scrollTop = 0;
  });
  $(closeId).addEventListener('click', () => {
    el.hidden = true;
    from.hidden = false;
  });
};

page('openRecords', 'records', 'closeRecords', menu, () => {
  const records = loadRecords(courseId);
  $('recordsList').textContent = records.length
    ? records.map((r, i) => `${i + 1}.  ${r.time.toFixed(2)}   ${r.date.slice(0, 10)}`).join('\n')
    : 'No times yet.';
  $('recordsList').style.whiteSpace = 'pre';
});
page('openSettings', 'settings', 'closeSettings', menu);
page('openCredits', 'credits', 'closeCredits', $('settings'));

const showCredits = (holder: HTMLElement, credits: Credit[]): void => {
  for (const c of credits) {
    const row = document.createElement('p');
    row.className = 'credit';
    const link = document.createElement('a');
    link.href = c.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = c.title;
    const details = document.createElement('small');
    details.textContent = [c.by, c.licence, c.note].filter(Boolean).join('. ');
    row.append(link, details);
    holder.append(row);
  }
};
showCredits($('musicCredits'), MUSIC_CREDITS);
showCredits($('softwareCredits'), SOFTWARE_CREDITS);
$('mitText').textContent = MIT_TEXT;

const settings = loadSettings();
const TILT_FULL_RANGE = [32, 12]; // degrees for full force at the lowest and highest sensitivity
const applySettings = (): void => {
  sound.setVolumes(settings.music, settings.sounds);
  const degrees = TILT_FULL_RANGE[0] + (TILT_FULL_RANGE[1] - TILT_FULL_RANGE[0]) * settings.tilt;
  game.tiltFull = (degrees * Math.PI) / 180;
};
const slider = (id: string, name: 'music' | 'sounds' | 'tilt'): void => {
  const input = $<HTMLInputElement>(id);
  input.value = String(settings[name]);
  input.addEventListener('input', () => {
    settings[name] = Number(input.value);
    applySettings();
    saveSettings(settings);
  });
};
const musicToggles = document.querySelectorAll<HTMLButtonElement>('.musicToggle');
const showMusicOn = (): void => {
  sound.setMusicOn(settings.musicOn);
  musicToggles.forEach((b) => {
    b.textContent = settings.musicOn ? 'Music on' : 'Music off';
  });
};
musicToggles.forEach((b) =>
  b.addEventListener('click', () => {
    settings.musicOn = !settings.musicOn;
    showMusicOn();
    saveSettings(settings);
  }),
);
showMusicOn();
slider('setMusic', 'music');
slider('setSounds', 'sounds');
slider('setTilt', 'tilt');
applySettings();

// The world's music, or a song the player picked from their phone instead.
const musicName = $('musicName');
const defaultMusic = $('defaultMusic');
const musicFile = $<HTMLInputElement>('musicFile');
const DEFAULT_MUSIC_NAME = MUSIC_CREDITS[0].title;
let ownMusicUrl: string | null = null;

const playOwn = async (name: string, file: Blob): Promise<boolean> => {
  const url = URL.createObjectURL(file);
  if (!(await sound.setMusic(url))) {
    URL.revokeObjectURL(url);
    return false;
  }
  if (ownMusicUrl) URL.revokeObjectURL(ownMusicUrl);
  ownMusicUrl = url;
  musicName.textContent = name;
  defaultMusic.hidden = false;
  return true;
};
const playDefault = async (): Promise<void> => {
  await sound.setMusic(VALLEY.music);
  if (ownMusicUrl) URL.revokeObjectURL(ownMusicUrl);
  ownMusicUrl = null;
  musicName.textContent = DEFAULT_MUSIC_NAME;
  defaultMusic.hidden = true;
};

musicName.textContent = DEFAULT_MUSIC_NAME;
void loadOwnMusic().then((own) => {
  if (own) void playOwn(own.name, own.file);
});
$('chooseMusic').addEventListener('click', () => musicFile.click());
musicFile.addEventListener('change', async () => {
  const file = musicFile.files?.[0];
  musicFile.value = ''; // so choosing the same song again still counts as a change
  if (!file) return;
  // Choosing a song means wanting to hear it.
  settings.musicOn = true;
  showMusicOn();
  saveSettings(settings);
  if (await playOwn(file.name, file)) {
    if (!(await saveOwnMusic({ name: file.name, file }))) musicName.textContent = `${file.name} (this session only)`;
  } else {
    if (ownMusicUrl) await sound.setMusic(ownMusicUrl);
    else await sound.setMusic(VALLEY.music);
    musicName.textContent = `Could not play ${file.name}`;
  }
});
defaultMusic.addEventListener('click', () => {
  void clearOwnMusic();
  void playDefault();
});

// The app out of sight stops drawing, and the phone may be held differently when it comes back.
document.addEventListener('visibilitychange', () => {
  sound.setHidden(document.hidden);
  if (!document.hidden) game.realign();
});

$('play').addEventListener('click', () => {
  game.begin();
  view.resetCamera();
  menu.hidden = true;
  showHud(true);
});

$('restart').addEventListener('click', () => {
  game.begin();
  view.resetCamera();
});
$('toMenu').addEventListener('click', () => {
  game.toMenu();
  view.resetCamera();
  menu.hidden = false;
  showHud(false);
  callout.textContent = '';
  sound.setRoll(0, false);
});

// Tap anywhere that isn't a button to burn the Boost Meter.
// Any first tap is also what lets the music start.
addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (!(e.target as Element).closest('button')) game.activateBurst();
});

// Sensor Lab: measure real lifts against a ruler, with the game paused.
let labOpen = false;
const labResults: string[] = [];
const gameGesture = sensors.jump.onGesture;
$('openLab').addEventListener('click', () => {
  labOpen = true;
  menu.hidden = true;
  lab.hidden = false;
  sensors.jump.onGesture = (g) => {
    labValue.textContent = `${g.cm.toFixed(1)} cm`;
    labResults.unshift(`${g.cm.toFixed(1).padStart(6)} cm   int ${g.integratedCm.toFixed(1).padStart(5)}   model ${g.modelCm.toFixed(1).padStart(5)}   ${g.activeSeconds.toFixed(2)}s`);
    labResults.length = Math.min(labResults.length, 8);
    labLog.textContent = labResults.join('\n');
    log('lab', { cm: g.cm });
  };
});
$('closeLab').addEventListener('click', () => {
  labOpen = false;
  lab.hidden = true;
  menu.hidden = false;
  sensors.jump.onGesture = gameGesture;
});

const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyB') game.activateBurst();
});
addEventListener('keyup', (e) => keys.delete(e.code));
const axis = (minus: string, plus: string) => (keys.has(plus) ? 1 : 0) - (keys.has(minus) ? 1 : 0);

let last = performance.now();
let frames = 0;
let statsAt = last;
let worstFrame = 0;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  worstFrame = Math.max(worstFrame, now - last);
  last = now;

  if (!labOpen) {
    game.update(dt, axis('ArrowLeft', 'ArrowRight'), axis('ArrowDown', 'ArrowUp'));
    view.render(dt);
    timeEl.textContent = game.time.toFixed(2);
    speedEl.textContent = `${Math.round(game.speed * 4)} km/h`;
    meterFill.style.transform = `scaleX(${game.meter})`;
    const cue = game.jumpCue;
    jumpCue.hidden = !cue;
    if (cue) {
      jumpCue.classList.toggle('land', cue.landing);
      jumpArrow.style.transform = `rotate(${cue.angle}rad)`;
      jumpTimer.style.visibility = cue.landing ? 'hidden' : 'visible';
      jumpTimerFill.style.transform = `scaleX(${cue.timeLeft})`;
    }
    sound.setRoll(game.speed, game.ball.grounded && (game.state === 'run' || game.state === 'loop'));
    if (calloutUntil && now > calloutUntil) {
      callout.textContent = '';
      calloutUntil = 0;
    }
  } else {
    const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1).padStart(6);
    labLive.textContent = `${sensors.hz.toFixed(0)} Hz  fused:${sensors.hasLinear}  steer${deg(sensors.steer)}  pitch${deg(sensors.pitch)}`;
  }

  frames++;
  if (now - statsAt >= 1000) {
    log('tick', {
      fps: Math.round((frames * 1000) / (now - statsAt)),
      worstMs: Math.round(worstFrame),
      hz: Math.round(sensors.hz),
      fused: sensors.hasLinear,
      state: labOpen ? 'lab' : game.state,
      x: Math.round(game.ball.x),
      z: Math.round(game.ball.z),
      meter: Math.round(game.meter * 100) / 100,
      speed: Math.round(game.speed),
      steer: Math.round((sensors.steer * 180) / Math.PI),
      pitch: Math.round((sensors.pitch * 180) / Math.PI),
    });
    frames = 0;
    statsAt = now;
    worstFrame = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
