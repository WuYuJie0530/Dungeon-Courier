export type SoundEvent = "pickup" | "unlock" | "hit" | "dash" | "win" | "lose" | "click";

const SOUND_PATHS: Record<SoundEvent, string> = {
  pickup: assetPath("sounds/pickup.wav"),
  unlock: assetPath("sounds/unlock.wav"),
  hit: assetPath("sounds/hit.wav"),
  dash: assetPath("sounds/dash.wav"),
  win: assetPath("sounds/win.wav"),
  lose: assetPath("sounds/lose.wav"),
  click: assetPath("sounds/click.wav"),
};

const MUSIC_PATH = assetPath("music/dungeon-loop.wav");

const SOUND_VOLUMES: Record<SoundEvent, number> = {
  pickup: 0.72,
  unlock: 0.74,
  hit: 0.68,
  dash: 0.62,
  win: 0.78,
  lose: 0.72,
  click: 0.42,
};

const MUSIC_BASE_VOLUME = 0.34;

const SYNTH_PROFILES: Record<SoundEvent, { frequency: number; endFrequency: number; duration: number; volume: number }> = {
  pickup: { frequency: 880, endFrequency: 1320, duration: 0.12, volume: 0.06 },
  unlock: { frequency: 520, endFrequency: 1040, duration: 0.32, volume: 0.08 },
  hit: { frequency: 260, endFrequency: 110, duration: 0.22, volume: 0.08 },
  dash: { frequency: 420, endFrequency: 980, duration: 0.16, volume: 0.055 },
  win: { frequency: 660, endFrequency: 1320, duration: 0.5, volume: 0.075 },
  lose: { frequency: 330, endFrequency: 130, duration: 0.5, volume: 0.07 },
  click: { frequency: 740, endFrequency: 740, duration: 0.055, volume: 0.035 },
};

const MUTED_STORAGE_KEY = "dungeon-courier-muted";
const SFX_VOLUME_STORAGE_KEY = "dungeon-courier-sfx-volume";
const MUSIC_VOLUME_STORAGE_KEY = "dungeon-courier-music-volume";

export type AudioSettings = {
  muted: boolean;
  sfxVolume: number;
  musicVolume: number;
};

function assetPath(path: string): string {
  return new URL(path, document.baseURI).href;
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 1;
  }
  return Math.max(0, Math.min(1, volume));
}

function storedVolume(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  return clampVolume(Number(raw));
}

export class AudioManager {
  private readonly pools = new Map<SoundEvent, HTMLAudioElement[]>();
  private readonly music: HTMLAudioElement;
  private audioContext: AudioContext | null = null;
  private muted: boolean;
  private sfxVolume: number;
  private musicVolume: number;
  private musicEnabled = false;

  constructor(private readonly paths = SOUND_PATHS) {
    this.muted = localStorage.getItem(MUTED_STORAGE_KEY) === "true";
    this.sfxVolume = storedVolume(SFX_VOLUME_STORAGE_KEY, 1);
    this.musicVolume = storedVolume(MUSIC_VOLUME_STORAGE_KEY, 1);
    for (const event of Object.keys(paths) as SoundEvent[]) {
      this.pools.set(
        event,
        Array.from({ length: 3 }, () => {
          const audio = new Audio(paths[event]);
          audio.preload = "auto";
          audio.volume = this.eventVolume(event);
          audio.muted = this.muted;
          return audio;
        }),
      );
    }
    this.music = new Audio(MUSIC_PATH);
    this.music.loop = true;
    this.music.preload = "auto";
    this.music.volume = this.currentMusicVolume();
    this.music.muted = this.muted;
  }

  load(): void {
    for (const pool of this.pools.values()) {
      for (const clip of pool) {
        clip.load();
      }
    }
    this.music.load();
  }

  play(event: SoundEvent): void {
    if (this.muted || this.sfxVolume <= 0) {
      return;
    }

    const clip = this.nextClip(event);
    if (!clip) {
      this.playSynth(event);
      return;
    }

    clip.currentTime = 0;
    const result = clip.play();
    if (result) {
      result.catch(() => {
        this.playSynth(event);
      });
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem(MUTED_STORAGE_KEY, String(muted));
    for (const pool of this.pools.values()) {
      for (const clip of pool) {
        clip.muted = muted;
      }
    }
    this.music.muted = muted;
    if (muted) {
      this.pauseMusic();
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  getSettings(): AudioSettings {
    return {
      muted: this.muted,
      sfxVolume: this.sfxVolume,
      musicVolume: this.musicVolume,
    };
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clampVolume(volume);
    localStorage.setItem(SFX_VOLUME_STORAGE_KEY, String(this.sfxVolume));
    this.syncClipVolumes();
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = clampVolume(volume);
    localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, String(this.musicVolume));
    this.syncMusicVolume();
  }

  enableMusic(): void {
    this.musicEnabled = true;
  }

  updateMusic(status: "playing" | "paused" | "won" | "lost" | "completed"): void {
    if (!this.musicEnabled || this.muted) {
      return;
    }

    if (status === "playing") {
      this.playMusic();
    } else if (status === "paused") {
      this.pauseMusic();
    } else {
      this.stopMusic();
    }
  }

  private playMusic(): void {
    if (!this.music.paused) {
      return;
    }
    this.music.play().catch(() => {
      this.musicEnabled = false;
    });
  }

  private pauseMusic(): void {
    this.music.pause();
  }

  private stopMusic(): void {
    this.music.pause();
    this.music.currentTime = 0;
  }

  private syncClipVolumes(): void {
    for (const [event, pool] of this.pools) {
      for (const clip of pool) {
        clip.volume = this.eventVolume(event);
      }
    }
  }

  private syncMusicVolume(): void {
    this.music.volume = this.currentMusicVolume();
  }

  private eventVolume(event: SoundEvent): number {
    return SOUND_VOLUMES[event] * this.sfxVolume;
  }

  private currentMusicVolume(): number {
    return MUSIC_BASE_VOLUME * this.musicVolume;
  }

  private nextClip(event: SoundEvent): HTMLAudioElement | null {
    const pool = this.pools.get(event);
    if (!pool || pool.length === 0) {
      return null;
    }
    return pool.find((clip) => clip.paused || clip.ended) ?? pool[0];
  }

  private playSynth(event: SoundEvent): void {
    const profile = SYNTH_PROFILES[event];
    const context = this.getAudioContext();
    if (!context) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = event === "hit" || event === "lose" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(profile.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, profile.endFrequency), now + profile.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(profile.volume * this.sfxVolume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + profile.duration);
  }

  private getAudioContext(): AudioContext | null {
    if (this.audioContext) {
      return this.audioContext;
    }
    const AudioContextConstructor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      return null;
    }
    this.audioContext = new AudioContextConstructor();
    return this.audioContext;
  }
}
