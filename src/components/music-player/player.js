const TRACK_MANIFEST_URL = "public/audio/tracks.json";

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

class MusicPlayer {
  constructor(root, tracks) {
    this.root = root;
    this.tracks = tracks;
    this.currentIndex = 0;
    this.audioContext = null;
    this.analyser = null;
    this.meterFrame = null;
    this.trackTransitionTimer = null;
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.audio = root.querySelector("[data-player-audio]");
    this.title = root.querySelector("[data-player-title]");
    this.status = root.querySelector("[data-player-status]");
    this.progress = root.querySelector("[data-player-progress]");
    this.currentTime = root.querySelector("[data-player-current-time]");
    this.duration = root.querySelector("[data-player-duration]");
    this.trackList = root.querySelector("[data-player-track-list]");
    this.needle = root.querySelector("[data-vu-needle]");

    this.renderTrackList();
    this.bindEvents();
    this.loadTrack(0);
    this.audio.removeAttribute("controls");
    this.root.classList.add("is-ready");
  }

  renderTrackList() {
    this.trackList.replaceChildren(
      ...this.tracks.map((track, index) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.trackIndex = index;
        button.textContent = track.title;
        button.setAttribute("aria-label", `Select ${track.title}`);
        item.append(button);
        return item;
      }),
    );
  }

  bindEvents() {
    this.root.querySelector("[data-player-previous]").addEventListener("click", () => this.changeTrack(-1));
    this.root.querySelector("[data-player-next]").addEventListener("click", () => this.changeTrack(1));
    this.root.querySelector("[data-player-play]").addEventListener("click", () => this.play());
    this.root.querySelector("[data-player-pause]").addEventListener("click", () => this.audio.pause());

    this.trackList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-track-index]");
      if (!button) return;
      this.loadTrack(Number(button.dataset.trackIndex), { play: true });
    });

    this.progress.addEventListener("input", () => {
      if (Number.isFinite(this.audio.duration)) {
        this.audio.currentTime = (Number(this.progress.value) / 100) * this.audio.duration;
      }
    });

    this.audio.addEventListener("loadedmetadata", () => this.updateTimeline());
    this.audio.addEventListener("durationchange", () => this.updateTimeline());
    this.audio.addEventListener("timeupdate", () => this.updateTimeline());
    this.audio.addEventListener("play", () => {
      this.status.textContent = `Playing ${this.tracks[this.currentIndex].title}`;
      this.updateSelectedTrack();
      this.startMeter();
    });
    this.audio.addEventListener("pause", () => {
      if (!this.audio.ended) this.status.textContent = "Playback paused";
      this.updateSelectedTrack();
      this.stopMeter();
    });
    this.audio.addEventListener("ended", () => this.scheduleNextTrack());
    this.audio.addEventListener("error", () => {
      this.status.textContent = "This audio file is unavailable. Choose another track or add the MP3 file.";
      this.updateSelectedTrack();
      this.stopMeter();
    });
  }

  loadTrack(index, { play = false } = {}) {
    if (this.trackTransitionTimer) clearTimeout(this.trackTransitionTimer);
    this.trackTransitionTimer = null;
    this.currentIndex = (index + this.tracks.length) % this.tracks.length;
    const track = this.tracks[this.currentIndex];
    this.audio.src = track.streamUrl;
    this.audio.load();
    this.title.textContent = track.title;
    this.status.textContent = `${track.title} selected`;
    this.progress.value = 0;
    this.currentTime.textContent = "0:00";
    this.duration.textContent = "0:00";
    this.updateSelectedTrack();

    if (play) this.play();
  }

  changeTrack(offset, play = !this.audio.paused) {
    this.loadTrack(this.currentIndex + offset, { play });
  }

  scheduleNextTrack() {
    this.updateSelectedTrack();
    this.status.textContent = "Next track begins shortly";
    this.trackTransitionTimer = window.setTimeout(() => {
      this.loadTrack(this.currentIndex + 1, { play: true });
    }, 1000);
  }

  async play() {
    await this.initializeMeter();

    if (this.audioContext?.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        this.root.classList.add("vu-unavailable");
      }
    }

    try {
      await this.audio.play();
    } catch (error) {
      if (error?.name !== "NotSupportedError") {
        this.status.textContent = "Playback could not start. Check the audio file and try again.";
      }
    }
  }

  updateSelectedTrack() {
    const isPlaying = !this.audio.paused;
    this.root.classList.toggle("is-playing", isPlaying);
    this.trackList.querySelectorAll("[data-track-index]").forEach((button, index) => {
      const selected = index === this.currentIndex;
      button.setAttribute("aria-current", selected ? "true" : "false");
      button.parentElement.classList.toggle("is-current", selected);
      button.textContent = `${selected ? isPlaying ? "Playing: " : "Selected: " : ""}${this.tracks[index].title}`;
    });
  }

  updateTimeline() {
    const duration = this.audio.duration;
    this.currentTime.textContent = formatTime(this.audio.currentTime);
    this.duration.textContent = formatTime(duration);
    this.progress.value = Number.isFinite(duration) && duration > 0
      ? (this.audio.currentTime / duration) * 100
      : 0;
    this.progress.setAttribute("aria-valuetext", `${formatTime(this.audio.currentTime)} of ${formatTime(duration)}`);
  }

  async initializeMeter() {
    if (this.analyser || this.reduceMotion.matches) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaElementSource(this.audio);
      source.connect(this.audioContext.destination);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;
      source.connect(this.analyser);
    } catch {
      this.analyser = null;
      this.root.classList.add("vu-unavailable");
    }
  }

  startMeter() {
    if (!this.analyser || this.reduceMotion.matches || this.meterFrame) return;
    const samples = new Uint8Array(this.analyser.frequencyBinCount);

    const draw = () => {
      this.analyser.getByteFrequencyData(samples);
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      const angle = Math.min(42, Math.max(-42, -42 + average * 0.55));
      this.needle.style.setProperty("--needle-angle", `${angle}deg`);
      this.meterFrame = requestAnimationFrame(draw);
    };
    draw();
  }

  stopMeter() {
    if (this.meterFrame) cancelAnimationFrame(this.meterFrame);
    this.meterFrame = null;
    this.needle.style.setProperty("--needle-angle", "-42deg");
  }
}

const initializePlayers = async () => {
  const roots = document.querySelectorAll("[data-music-player]");

  try {
    const response = await fetch(TRACK_MANIFEST_URL);
    if (!response.ok) throw new Error(`Track manifest returned ${response.status}`);

    const tracks = await response.json();
    if (!Array.isArray(tracks) || tracks.length === 0) throw new Error("Track manifest is empty");

    roots.forEach((root) => new MusicPlayer(root, tracks));
  } catch {
    roots.forEach((root) => {
      root.querySelector("[data-player-title]").textContent = "No tracks available";
      root.querySelector("[data-player-status]").textContent = "The audio library could not be loaded.";
      root.querySelectorAll("button, input").forEach((control) => {
        control.disabled = true;
      });
    });
  }
};

initializePlayers();
