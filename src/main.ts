import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Sound } from './audio';
import { MIT_TEXT, MUSIC_CREDITS, SOFTWARE_CREDITS, type Credit } from './credits';
import { FIRST_COURSE, type CourseData } from './course';
import { TrackEditor } from './editor';
import { Game, type Cue } from './game';
import { clearOwnMusic, loadOwnMusic, saveOwnMusic } from './musicStore';
import { Multiplayer } from './multiplayer';
import { isDesktop } from './net';
import { LEVELS, type LevelStyle } from './levels';
import { deleteMyTrack, loadMyTracks, MAX_TRACK_OPS, saveMyTrack } from './myTracks';
import { addRecord, loadRecords } from './records';
import { Sensors } from './sensors';
import { loadSettings, MAX_NAME, saveSettings } from './settings';
import { log, startTelemetry } from './telemetry';
import { THEMES, themeById } from './themes';
import { RACE_TRACKS } from './tracks';
import { View } from './view';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

startTelemetry();

const sensors = new Sensors();
sensors.start();
const game = new Game(sensors);
const settings = loadSettings();
const theme = themeById(settings.theme);
const root = document.documentElement.style;
root.setProperty('--font', theme.ui.font);
root.setProperty('--ink', theme.ui.ink);
root.setProperty('--paper', theme.ui.paper);
root.setProperty('--page', theme.ui.page);
root.setProperty('--pressed', theme.ui.pressed);
root.setProperty('--accent', theme.accent);
const view = new View(game, theme);
const themeMusic = `music/${theme.id}.mp3`;
const sound = new Sound(themeMusic);

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
const raceHud = $('raceHud');
const weaponEl = $('weapon');
const restart = $('restart');
const menu = $('menu');
const menuText = $('menuText');
if (isDesktop) menuText.textContent = 'Roll with the arrow keys. Space burns the boost or fires a weapon.';

let calloutUntil = 0;
const showCallout = (text: string, color = theme.ui.ink, seconds = 1.1): void => {
  callout.textContent = text;
  callout.style.color = color;
  callout.style.fontSize = text.length <= 2 ? '84px' : '';
  calloutUntil = performance.now() + seconds * 1000;
};

game.onCallout = (text, tone) => {
  const color = tone === 'good' ? '#2f9e6e' : tone === 'bad' ? '#c8443f' : tone === 'count' ? theme.ui.ink : '#ffffff';
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
const multiplayer = new Multiplayer(game, view, settings, menu);
if (import.meta.env.DEV) Object.assign(globalThis, { game, view, multiplayer });

// Asked once, on the very first run, and changeable in Settings after that.
const nameInput = $<HTMLInputElement>('playerName');
const setPlayerName = (typed: string): void => {
  settings.playerName = typed.trim().slice(0, MAX_NAME) || 'Player';
  multiplayer.setName(settings.playerName);
  saveSettings(settings);
};
nameInput.value = settings.playerName;
nameInput.addEventListener('input', () => setPlayerName(nameInput.value));
if (!settings.playerName) {
  menu.hidden = true;
  $('welcome').hidden = false;
  $('welcomeDone').addEventListener('click', () => {
    setPlayerName($<HTMLInputElement>('welcomeName').value);
    nameInput.value = settings.playerName;
    $('welcome').hidden = true;
    menu.hidden = false;
  });
}
multiplayer.onCue = (cue) => game.onCue?.(cue);
multiplayer.onCallout = (text, tone) => game.onCallout?.(text, tone);
multiplayer.onRacing = (on) => {
  showHud(on);
  hud.hidden = !on || multiplayer.battling;
  raceHud.hidden = !on;
  restart.hidden = on;
  weaponEl.textContent = '';
  if (!on) {
    callout.textContent = '';
    sound.setRoll(0, false);
  }
};
game.onFinish = (time) => {
  if (multiplayer.racing) {
    multiplayer.finished(time);
    return;
  }
  const best = addRecord(soloCourse.id, time)[0];
  showHud(false);
  callout.textContent = '';
  if (testingTrack) {
    backToEditor(`Finished in ${time.toFixed(2)}`);
    return;
  }
  menuText.textContent = `Time ${time.toFixed(2)}   Best ${best.time.toFixed(2)}`;
  $('again').hidden = false;
  const next = LEVELS[LEVELS.findIndex((l) => l.id === soloCourse.id) + 1] ?? (soloCourse === FIRST_COURSE ? LEVELS[0] : undefined);
  $('nextLevel').hidden = !next || (soloCourse !== FIRST_COURSE && !LEVELS.some((l) => l.id === soloCourse.id));
  if (next) $('nextLevel').textContent = `Next: ${next.name}`;
  menu.hidden = false;
};

// The course played alone at the moment, and whether that is the creator trying out a track.
let soloCourse: CourseData = FIRST_COURSE;
let testingTrack = false;

const playSolo = (course: CourseData): void => {
  if (game.course.data !== course) {
    game.loadCourse(course);
    view.rebuildCourse();
  }
  soloCourse = course;
  game.begin();
  view.resetCamera();
  for (const id of ['menu', 'levels', 'mine', 'editor']) $(id).hidden = true;
  $('again').hidden = true;
  $('nextLevel').hidden = true;
  showHud(true);
};

const bestLabel = (id: string): string => {
  const best = loadRecords(id)[0];
  return best ? best.time.toFixed(2) : '';
};

const courseChoice = (course: CourseData): HTMLButtonElement => {
  const choice = document.createElement('button');
  choice.className = 'levelChoice';
  const name = document.createElement('span');
  name.textContent = course.name;
  const best = document.createElement('small');
  best.textContent = bestLabel(course.id);
  choice.append(name, best);
  choice.addEventListener('click', () => playSolo(course));
  return choice;
};

const LEVEL_STYLES: LevelStyle[] = ['Speed', 'Maze', 'Skill', 'Mix'];
const drawLevels = (): void => {
  const list = $('levelList');
  list.replaceChildren(courseChoice(FIRST_COURSE));
  for (const style of LEVEL_STYLES) {
    const title = document.createElement('h3');
    title.textContent = style;
    list.append(title, ...LEVELS.filter((l) => l.style === style).map(courseChoice));
  }
  const mine = loadMyTracks();
  if (mine.length > 0) {
    const title = document.createElement('h3');
    title.textContent = 'Your tracks';
    list.append(title, ...mine.map(courseChoice));
  }
};

// The track creator, and the page of tracks that leads to it.
const editor = new TrackEditor();
const backToEditor = (message: string): void => {
  testingTrack = false;
  showHud(false);
  callout.textContent = '';
  $('editor').hidden = false;
  editor.draw();
  $('editMessage').textContent = message;
};
editor.onTest = (track) => {
  testingTrack = true;
  playSolo(track);
};
editor.onSave = (track) => saveMyTrack(track);
const openEditor = (track?: ReturnType<typeof loadMyTracks>[number]): void => {
  $('mine').hidden = true;
  $('editor').hidden = false;
  $('editor').scrollTop = 0;
  editor.open(track);
};
const drawMine = (): void => {
  const list = $('mineList');
  list.replaceChildren();
  for (const track of loadMyTracks()) {
    const row = document.createElement('div');
    row.className = 'trackRow';
    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openEditor(track));
    // A first tap asks, as there is no getting it back.
    const remove = document.createElement('button');
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => {
      if (remove.textContent === 'Sure?') {
        deleteMyTrack(track.id);
        drawMine();
      } else {
        remove.textContent = 'Sure?';
      }
    });
    row.append(courseChoice(track), edit, remove);
    list.append(row);
  }
  if (!list.hasChildNodes()) list.textContent = `No tracks yet. Each can have up to ${MAX_TRACK_OPS} pieces.`;
};
$('newTrack').addEventListener('click', () => openEditor());
$('closeEditor').addEventListener('click', () => {
  $('editor').hidden = true;
  drawMine();
  $('mine').hidden = false;
});

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

page('play', 'levels', 'closeLevels', menu, drawLevels);
page('openMine', 'mine', 'closeMine', menu, drawMine);
page('openThemes', 'themes', 'closeThemes', menu);
for (const t of THEMES) {
  const choice = document.createElement('button');
  choice.className = t.id === theme.id ? 'themeChoice current' : 'themeChoice';
  choice.textContent = t.name;
  choice.style.background = `linear-gradient(90deg, ${t.sky}, ${t.floor}, ${t.wall}, ${t.accent})`;
  // The world is built once for its theme, so a new one starts the page afresh.
  choice.addEventListener('click', () => {
    if (t.id === theme.id) return;
    settings.theme = t.id;
    saveSettings(settings);
    location.reload();
  });
  $('themeList').append(choice);
}
page('openRecords', 'records', 'closeRecords', menu, () => {
  const lines: string[] = [];
  for (const course of [FIRST_COURSE, ...LEVELS, ...RACE_TRACKS, ...loadMyTracks()]) {
    const records = loadRecords(course.id);
    if (records.length === 0) continue;
    lines.push(course.name, ...records.map((r, i) => `${i + 1}.  ${r.time.toFixed(2)}   ${r.date.slice(0, 10)}`), '');
  }
  $('recordsList').textContent = lines.length ? lines.join('\n') : 'No times yet.';
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
$('musicBlock').hidden = MUSIC_CREDITS.length === 0;
showCredits($('musicCredits'), MUSIC_CREDITS);
showCredits($('softwareCredits'), SOFTWARE_CREDITS);
$('mitText').textContent = MIT_TEXT;

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

// The theme's music file if the game has one, or a song the player picked from their phone instead.
const musicName = $('musicName');
const defaultMusic = $('defaultMusic');
const musicFile = $<HTMLInputElement>('musicFile');
const NO_OWN_MUSIC = 'Theme default';
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
  await sound.setMusic(themeMusic);
  if (ownMusicUrl) URL.revokeObjectURL(ownMusicUrl);
  ownMusicUrl = null;
  musicName.textContent = NO_OWN_MUSIC;
  defaultMusic.hidden = true;
};

musicName.textContent = NO_OWN_MUSIC;
void loadOwnMusic(theme.id).then((own) => {
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
    if (!(await saveOwnMusic(theme.id, { name: file.name, file }))) musicName.textContent = `${file.name} (this session only)`;
  } else {
    if (ownMusicUrl) await sound.setMusic(ownMusicUrl);
    else await sound.setMusic(themeMusic);
    musicName.textContent = `Could not play ${file.name}`;
  }
});
defaultMusic.addEventListener('click', () => {
  void clearOwnMusic(theme.id);
  void playDefault();
});

// The app out of sight stops drawing, and the phone may be held differently when it comes back.
document.addEventListener('visibilitychange', () => {
  sound.setHidden(document.hidden);
  if (!document.hidden) game.realign();
});

$('again').addEventListener('click', () => playSolo(soloCourse));
$('nextLevel').addEventListener('click', () => {
  const next = LEVELS[LEVELS.findIndex((l) => l.id === soloCourse.id) + 1];
  if (next) playSolo(next);
});

restart.addEventListener('click', () => {
  game.begin();
  view.resetCamera();
});
$('toMenu').addEventListener('click', () => {
  if (multiplayer.racing) {
    multiplayer.quitRace();
    return;
  }
  game.toMenu();
  view.resetCamera();
  showHud(false);
  callout.textContent = '';
  sound.setRoll(0, false);
  if (testingTrack) {
    backToEditor('');
    return;
  }
  menu.hidden = false;
});

// Tap anywhere that isn't a button to burn the Boost Meter.
// Any first tap is also what lets the music start.
addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (!(e.target as Element).closest('button, input')) game.tap();
});

const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyB' || e.code === 'Space') game.tap();
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

  game.update(dt, axis('ArrowLeft', 'ArrowRight'), axis('ArrowDown', 'ArrowUp'));
  multiplayer.showRaceHud(dt);
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

  frames++;
  if (now - statsAt >= 1000) {
    log('tick', {
      fps: Math.round((frames * 1000) / (now - statsAt)),
      worstMs: Math.round(worstFrame),
      hz: Math.round(sensors.hz),
      fused: sensors.hasLinear,
      state: game.state,
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
