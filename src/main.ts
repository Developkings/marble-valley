import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Sound } from './audio';
import { Game, type Cue } from './game';
import { addRecord, loadRecords } from './records';
import { Sensors } from './sensors';
import { log, startTelemetry } from './telemetry';
import { View } from './view';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

startTelemetry();

const sensors = new Sensors();
sensors.start();
const game = new Game(sensors);
const view = new View(game);
const sound = new Sound();
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
  showCallout(text, color, text === 'HIT' ? 4 : 1.1);
};
const HAPTICS: Partial<Record<Cue, ImpactStyle>> = {
  boost: ImpactStyle.Heavy,
  burst: ImpactStyle.Heavy,
  catch: ImpactStyle.Heavy,
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

$('play').addEventListener('click', () => {
  sound.unlock();
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
addEventListener('pointerdown', (e) => {
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
  if (e.code === 'Space') game.simulateGesture(20);
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
    sound.setRoll(game.speed, game.ball.grounded && game.state === 'run');
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
