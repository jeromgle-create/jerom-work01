// Proximity voice chat over a WebRTC peer-to-peer mesh. Socket.IO only relays signaling.
import { remoteTargets, selfPos, socket } from "./net";

const FULL_VOLUME_DIST = 3; // within this distance: full volume
const SILENT_DIST = 16; // beyond this distance: silent
const SPEAK_RMS = 0.02; // RMS level that counts as "speaking"
const TICK_MS = 100;
const DEFAULT_ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];

type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type Peer = {
  pc: RTCPeerConnection;
  queue: RTCIceCandidateInit[];
  audio?: HTMLAudioElement;
  gain?: GainNode;
  pan?: StereoPannerNode;
  analyser?: AnalyserNode;
  volume: number;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function rms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

export class VoiceChat {
  private ctx: AudioContext | null = null;
  private local: MediaStream | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private peers = new Map<string, Peer>();
  private ice: RTCIceServer[] = DEFAULT_ICE;
  private timer: ReturnType<typeof setInterval> | null = null;
  private buf = new Float32Array(new ArrayBuffer(1024 * 4));
  private speaking = new Set<string>();
  private micOn = false;
  /** Players muted locally by this listener. */
  readonly blocked = new Set<string>();
  selfId = "";

  constructor(private onSpeaking: (ids: Set<string>) => void) {}

  get active() {
    return this.local !== null;
  }

  async join() {
    if (this.active) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("이 브라우저(또는 HTTP 주소)에서는 마이크를 쓸 수 없습니다. HTTPS 주소로 접속해 주세요.");
    }
    // Created inside the click handler so browsers allow audio playback.
    const ctx = new AudioContext();
    await ctx.resume();
    let local: MediaStream;
    try {
      local = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      await ctx.close();
      const name = (e as DOMException)?.name;
      throw new Error(
        name === "NotAllowedError"
          ? "마이크 권한이 거부되었습니다. 브라우저 주소창의 권한 설정에서 마이크를 허용해 주세요."
          : name === "NotFoundError"
            ? "사용할 수 있는 마이크가 없습니다."
            : "마이크를 시작하지 못했습니다.",
      );
    }
    try {
      const res = await fetch("/api/ice");
      const data = await res.json();
      if (Array.isArray(data.iceServers) && data.iceServers.length) this.ice = data.iceServers;
    } catch {
      /* keep default STUN */
    }
    const ack = await socket.emitWithAck("voice:join", {});
    if (!ack?.ok) {
      local.getTracks().forEach((t) => t.stop());
      await ctx.close();
      throw new Error(ack?.error ?? "음성 채팅에 참여하지 못했습니다.");
    }
    this.ctx = ctx;
    this.local = local;
    this.micOn = true;
    this.localAnalyser = ctx.createAnalyser();
    this.localAnalyser.fftSize = 1024;
    ctx.createMediaStreamSource(local).connect(this.localAnalyser);
    socket.on("rtc:signal", this.onSignal);
    // Newcomer offers to everyone already in voice; they answer.
    for (const id of ack.peers as string[]) void this.call(id);
    this.timer = setInterval(this.tick, TICK_MS);
  }

  leave() {
    if (!this.active) return;
    socket.emit("voice:leave");
    this.teardown();
  }

  /** Local cleanup only (also used when the socket drops). */
  teardown() {
    socket.off("rtc:signal", this.onSignal);
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.localAnalyser = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
    this.micOn = false;
    if (this.speaking.size) {
      this.speaking = new Set();
      this.onSpeaking(this.speaking);
    }
  }

  setMic(on: boolean) {
    if (!this.local) return;
    this.micOn = on;
    this.local.getAudioTracks().forEach((t) => (t.enabled = on));
    socket.emit("voice:mute", { muted: !on });
  }

  /** Another player left voice or the world. */
  closePeer(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.audio?.pause();
    if (p.audio) p.audio.srcObject = null;
    p.gain?.disconnect();
    this.peers.delete(id);
  }

  /** Debug snapshot (used by automated tests). */
  debug() {
    return [...this.peers.entries()].map(([id, p]) => ({
      id,
      state: p.pc.connectionState,
      hasAudio: !!p.gain,
      volume: +p.volume.toFixed(2),
    }));
  }

  private newPeer(id: string) {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const peer: Peer = { pc, queue: [], volume: 0 };
    this.peers.set(id, peer);
    for (const track of this.local!.getTracks()) pc.addTrack(track, this.local!);
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit("rtc:signal", { to: id, data: { candidate: e.candidate.toJSON() } });
    };
    pc.ontrack = (e) => this.attach(id, e.streams[0] ?? new MediaStream([e.track]));
    return peer;
  }

  private async call(id: string) {
    if (this.peers.has(id)) return;
    const { pc } = this.newPeer(id);
    await pc.setLocalDescription(await pc.createOffer());
    socket.emit("rtc:signal", { to: id, data: { sdp: pc.localDescription!.toJSON() } });
  }

  private onSignal = async ({ from, data }: { from: string; data: Signal }) => {
    if (!this.active) return;
    let peer = this.peers.get(from);
    try {
      if (data.sdp) {
        if (data.sdp.type === "offer") {
          if (peer) this.closePeer(from); // the other side restarted; start fresh
          peer = this.newPeer(from);
        }
        if (!peer) return;
        await peer.pc.setRemoteDescription(data.sdp);
        for (const c of peer.queue.splice(0)) await peer.pc.addIceCandidate(c);
        if (data.sdp.type === "offer") {
          await peer.pc.setLocalDescription(await peer.pc.createAnswer());
          socket.emit("rtc:signal", { to: from, data: { sdp: peer.pc.localDescription!.toJSON() } });
        }
      } else if (data.candidate && peer) {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate);
        else peer.queue.push(data.candidate);
      }
    } catch (e) {
      console.warn("voice signaling failed", e);
    }
  };

  private attach(id: string, stream: MediaStream) {
    const peer = this.peers.get(id);
    const ctx = this.ctx;
    if (!peer || !ctx || peer.gain) return;
    // Chrome only feeds remote WebRTC audio into Web Audio when the stream is also attached to a media element.
    const audio = new Audio();
    audio.srcObject = stream;
    audio.muted = true;
    void audio.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src.connect(analyser);
    src.connect(gain).connect(pan).connect(ctx.destination);
    Object.assign(peer, { audio, analyser, gain, pan });
  }

  private tick = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    const next = new Set<string>();
    for (const [id, p] of this.peers) {
      const t = remoteTargets.get(id);
      let vol = 0;
      if (t && !this.blocked.has(id)) {
        const d = Math.hypot(t.x - selfPos.x, t.z - selfPos.z);
        vol = clamp((SILENT_DIST - d) / (SILENT_DIST - FULL_VOLUME_DIST), 0, 1);
        p.pan?.pan.setTargetAtTime(clamp((t.x - selfPos.x) / 8, -1, 1) * 0.7, ctx.currentTime, 0.1);
      }
      p.volume = vol;
      p.gain?.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
      if (vol > 0 && p.analyser && rms(p.analyser, this.buf) > SPEAK_RMS) next.add(id);
    }
    if (this.micOn && this.localAnalyser && this.selfId && rms(this.localAnalyser, this.buf) > SPEAK_RMS) {
      next.add(this.selfId);
    }
    const changed = next.size !== this.speaking.size || [...next].some((id) => !this.speaking.has(id));
    if (changed) {
      this.speaking = next;
      this.onSpeaking(next);
    }
  };
}
