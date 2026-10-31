import { ARENAS } from './arenas';
import { FIRST_COURSE, type CourseData } from './course';
import type { Game } from './game';
import { LEVELS } from './levels';
import { loadMyTracks } from './myTracks';
import { Race, START_HEARTS, WEAPON_NAMES, type RaceMessage } from './race';
import { PLAYER_COLOURS } from './raceView';
import { addRecord, loadRecords } from './records';
import { MAX_PLAYERS, Room } from './room';
import { saveSettings, type Settings } from './settings';
import { RACE_TRACKS, trackById } from './tracks';
import type { View } from './view';

const LAP_CHOICES = [1, 3, 5];
const LATE_TO_JOIN = 2500; // ms: a race that started longer ago than this is left to finish without us
const ALL_COURSES: CourseData[] = [FIRST_COURSE, ...LEVELS, ...RACE_TRACKS];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ordinal = (n: number): string => `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`;

function bestTimes(): Record<string, number> {
  const bests: Record<string, number> = {};
  for (const course of ALL_COURSES) {
    const best = loadRecords(course.id)[0];
    if (best) bests[course.id] = best.time;
  }
  return bests;
}

const HEART = 'M12 21C5 15 2 11.5 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 3.5-3 7-10 13z';

function hearts(count: number, colour: string, size: number): string {
  let drawn = '';
  for (let i = 0; i < START_HEARTS; i++) {
    const look = i < count ? `fill="${colour}"` : `fill="none" stroke="${colour}" stroke-width="2"`;
    drawn += `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="${HEART}" ${look}/></svg>`;
  }
  return drawn;
}

function button(text: string, onClick: () => void, chosen = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  if (chosen) b.className = 'chosen';
  b.addEventListener('click', onClick);
  return b;
}

// The menus and flow of playing over Wi-Fi. The rules of the race itself are in race.ts.
export class Multiplayer {
  private room: Room;
  private race: Race | null = null;
  private raceId = 0;
  private track: CourseData = RACE_TRACKS[0];
  private shared = new Map<string, CourseData>();
  private heartsShown = '';

  // Handed the race ending or starting so the rest of the app can show its HUD.
  onRacing: ((on: boolean) => void) | null = null;
  onCue: ((cue: 'orb' | 'hit' | 'burst' | 'wall') => void) | null = null;
  onCallout: ((text: string, tone: 'good' | 'bad') => void) | null = null;

  constructor(
    private game: Game,
    private view: View,
    settings: Settings,
    private menu: HTMLElement,
  ) {
    if (!settings.playerId) {
      settings.playerId = crypto.randomUUID();
      saveSettings(settings);
    }
    // Tabs on one computer share their settings, so testing tells them apart by address.
    const testId = import.meta.env.DEV ? new URLSearchParams(location.search).get('player') : null;
    this.room = new Room(testId ?? settings.playerId, testId ?? settings.playerName, bestTimes);
    this.room.onFound = () => this.showRooms();
    this.room.onChange = () => this.roomChanged();
    this.room.onLeft = (why) => this.leftRoom(why);
    this.room.onRaceMessage = (m: RaceMessage) => this.race?.receive(m);
    this.room.findTrack = (id) => this.findTrack(id);
    this.room.onTrackData = (data) => {
      this.shared.set(data.id, data);
      this.roomChanged();
    };

    $('openMulti').addEventListener('click', () => void this.open());
    $('closeMulti').addEventListener('click', () => {
      $('multi').hidden = true;
      menu.hidden = false;
    });
    $('hostRoom').addEventListener('click', () => {
      this.room.host(this.track.id);
      this.showLobby();
    });
    $('leaveRoom').addEventListener('click', () => this.leftRoom(''));
    $('startRace').addEventListener('click', () => this.room.startRace());
    $('closeResults').addEventListener('click', () => {
      this.stopRace();
      this.showLobby();
    });
  }

  // The name has changed in Settings: the room hears it with the next message.
  setName(name: string): void {
    this.room.name = name;
  }

  get racing(): boolean {
    return this.race !== null;
  }

  get battling(): boolean {
    return this.race?.battle ?? false;
  }

  private findTrack(id: string): CourseData | undefined {
    return trackById(id) ?? ARENAS.find((a) => a.id === id) ?? loadMyTracks().find((t) => t.id === id) ?? this.shared.get(id);
  }

  // Lap, place and weapon, for the HUD. Called every frame while racing.
  showRaceHud(dt: number): void {
    const race = this.race;
    if (!race) return;
    race.tick(dt);
    $('raceLap').textContent = race.battle || race.open ? '' : `Lap ${Math.min(race.lap, race.laps)}/${race.laps}`;
    $('racePlace').textContent = race.battle ? '' : ordinal(race.place);
    if (race.battle) this.showHearts(race);
    const weapon = race.weapon;
    $('weapon').textContent = weapon ? `${WEAPON_NAMES[weapon]}: tap` : '';
    if (!$('results').hidden) this.showResults();
  }

  // Along the top of the screen: this player's own, big, and everyone else's beneath.
  private showHearts(race: Race): void {
    const rivals = [...race.rivals.values()];
    const shown = [race.hearts, ...rivals.map((r) => r.hearts)].join();
    if (shown === this.heartsShown) return;
    this.heartsShown = shown;
    const own = PLAYER_COLOURS[race.gridSlot % PLAYER_COLOURS.length];
    $('heartsOwn').innerHTML = hearts(race.hearts, own, 40);
    const others = $('heartsOthers');
    others.replaceChildren();
    for (const r of rivals) {
      const holder = document.createElement('div');
      const name = document.createElement('span');
      name.textContent = r.name;
      const row = document.createElement('span');
      row.innerHTML = hearts(r.hearts, PLAYER_COLOURS[r.index % PLAYER_COLOURS.length], 15);
      holder.append(name, row);
      others.append(holder);
    }
  }

  // Quits the race from the in-game menu button, back to the room.
  quitRace(): void {
    this.stopRace();
    this.showLobby();
  }

  finished(time: number): void {
    const race = this.race;
    if (!race) return;
    race.finish = time;
    race.weapon = null;
    if (race.hearts <= 0) this.onCallout?.('OUT', 'bad');
    if (!race.battle) addRecord(this.track.id, time);
    this.onRacing?.(false);
    this.showResults();
    $('results').hidden = false;
  }

  private async open(): Promise<void> {
    this.menu.hidden = true;
    $('multi').hidden = false;
    $('multiStatus').textContent = 'Looking for rooms on this Wi-Fi...';
    $('multiName').textContent = `Playing as ${this.room.name}`;
    this.showRooms();
    if (!(await this.room.start())) $('multiStatus').textContent = 'Could not reach the Wi-Fi from this device.';
  }

  private showRooms(): void {
    const list = $('roomList');
    list.replaceChildren();
    for (const found of this.room.found) {
      const choice = button(`${found.host}  (${found.players}/${MAX_PLAYERS})`, () => {
        this.room.join(found.ip);
        this.showLobby();
      });
      choice.disabled = found.players >= MAX_PLAYERS;
      list.append(choice);
    }
    if (this.room.found.length > 0) $('multiStatus').textContent = 'Tap a room to join it.';
    else $('multiStatus').textContent = 'Looking for rooms on this Wi-Fi...';
  }

  private showLobby(): void {
    $('multi').hidden = true;
    $('results').hidden = true;
    this.menu.hidden = true;
    $('lobby').hidden = false;
    this.drawLobby();
  }

  private roomChanged(): void {
    const state = this.room.state;
    const track = this.findTrack(state.track);
    if (track) this.track = track;
    if (state.raceId !== this.raceId && (track || state.raceAge > LATE_TO_JOIN)) {
      this.raceId = state.raceId;
      if (state.raceId > 0 && state.raceAge <= LATE_TO_JOIN) this.startRace(state.raceAge);
    }
    if (!$('lobby').hidden) this.drawLobby();
  }

  private drawLobby(): void {
    const { state, isHost } = this.room;
    $('lobbyTitle').textContent = isHost ? 'Your room' : 'Room';

    const players = $('lobbyPlayers');
    players.replaceChildren();
    state.players.forEach((p, i) => {
      const row = document.createElement('div');
      row.textContent = p.name;
      row.style.color = PLAYER_COLOURS[i % PLAYER_COLOURS.length];
      players.append(row);
    });
    if (state.players.length === 0) players.textContent = 'Joining...';

    const lists: [string, CourseData[]][] = [['lobbyTracks', RACE_TRACKS], ['lobbyArenas', ARENAS], ['lobbyMine', isHost ? loadMyTracks() : []]];
    for (const [id, list] of lists) {
      const holder = $(id);
      holder.replaceChildren();
      for (const t of list) {
        const chosen = t.id === state.track;
        if (isHost) holder.append(button(t.name, () => this.room.setTrack(t.id), chosen));
      }
    }
    $('lobbyArenasTitle').hidden = !isHost;
    $('lobbyTracksTitle').hidden = !isHost;
    $('lobbyMineTitle').hidden = !isHost || $('lobbyMine').childElementCount === 0;
    const known = this.findTrack(state.track);
    $('lobbyChosen').textContent = isHost ? '' : (known?.name ?? 'Getting the track...');
    const laps = $('lobbyLaps');
    laps.replaceChildren();
    $('startRace').textContent = known?.kind === 'arena' ? 'Start battle' : 'Start race';
    if (known?.kind === 'arena' || known?.kind === 'course') {
      laps.textContent = known.kind === 'arena' ? `Battle: ${START_HEARTS} hearts, last one rolling wins.` : 'From start to finish.';
    } else if (isHost) {
      for (const n of LAP_CHOICES) laps.append(button(`${n} ${n === 1 ? 'lap' : 'laps'}`, () => this.room.setLaps(n), n === state.laps));
    } else {
      laps.textContent = `${state.laps} ${state.laps === 1 ? 'lap' : 'laps'}`;
    }
    $('startRace').hidden = !isHost;
    $('lobbyWait').hidden = isHost;
    this.drawRoomRecords();
  }

  // Everyone's best on every course, so the room can compare.
  private drawRoomRecords(): void {
    const table = $('roomRecords');
    table.replaceChildren();
    const { players } = this.room.state;
    for (const course of ALL_COURSES) {
      const times = players
        .filter((p) => p.bests[course.id] !== undefined)
        .map((p) => ({ name: p.name, time: p.bests[course.id] }))
        .sort((a, b) => a.time - b.time);
      if (times.length === 0) continue;
      const title = document.createElement('h3');
      title.textContent = course.name;
      table.append(title);
      for (const t of times) {
        const row = document.createElement('div');
        row.textContent = `${t.time.toFixed(2)}   ${t.name}`;
        table.append(row);
      }
    }
    if (!table.hasChildNodes()) table.textContent = 'No times yet.';
  }

  private startRace(age: number): void {
    const { players, laps } = this.room.state;
    if (!players.some((p) => p.id === this.room.id)) return;
    this.stopRace();
    this.game.loadCourse(this.track);
    this.view.rebuildCourse();
    const race = new Race(
      this.game.course,
      players,
      this.room.id,
      laps,
      this.game.ball,
      (m) => this.room.sendRace(m),
      () => this.game.canBeHit,
    );
    race.onCue = (cue) => this.onCue?.(cue);
    race.onCallout = (text, tone) => this.onCallout?.(text, tone);
    this.race = race;
    this.heartsShown = '';
    $('hearts').hidden = !race.battle;
    this.game.beginRace(race, age / 1000);
    this.view.showRace();
    this.view.resetCamera();
    $('lobby').hidden = true;
    $('results').hidden = true;
    this.menu.hidden = true;
    this.onRacing?.(true);
  }

  private stopRace(): void {
    if (!this.race) return;
    this.race = null;
    $('hearts').hidden = true;
    this.game.leaveRace();
    this.game.toMenu();
    this.view.showRace();
    this.onRacing?.(false);
  }

  private showResults(): void {
    const race = this.race;
    if (!race) return;
    const list = $('resultsList');
    list.replaceChildren();
    race.standings().forEach((s, i) => {
      const row = document.createElement('div');
      const time = race.battle
        ? s.finish === null
          ? `still rolling, ${s.hearts} left`
          : s.hearts > 0
            ? 'wins'
            : `out at ${s.finish.toFixed(0)}s`
        : s.finish !== null
          ? s.finish.toFixed(2)
          : `lap ${s.lap}`;
      row.textContent = `${i + 1}.  ${s.name}   ${time}`;
      row.style.color = PLAYER_COLOURS[s.index % PLAYER_COLOURS.length];
      list.append(row);
    });
  }

  // Back to the main menu, on the solo course.
  private leftRoom(why: string): void {
    this.stopRace();
    this.room.leave();
    this.raceId = 0;
    this.game.loadCourse(FIRST_COURSE);
    this.view.rebuildCourse();
    this.view.resetCamera();
    $('lobby').hidden = true;
    $('results').hidden = true;
    if (why) {
      $('multi').hidden = false;
      $('multiStatus').textContent = why;
    } else {
      this.menu.hidden = false;
    }
  }
}
