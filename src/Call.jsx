import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { getToken } from "./firebase.js";

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0] && parts[0][0]) || "?").toUpperCase() + ((parts[1] && parts[1][0]) || "").toUpperCase();
}

function Tile({ p, isLocal, speaking }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const camPub = p.getTrackPublication(Track.Source.Camera);
  const micPub = p.getTrackPublication(Track.Source.Microphone);
  const camTrack = camPub && camPub.track && !camPub.isMuted ? camPub.track : null;
  const micTrack = !isLocal && micPub && micPub.track ? micPub.track : null;
  const micOn = !!micPub && !micPub.isMuted;

  useEffect(() => {
    const el = videoRef.current;
    if (!camTrack || !el) return;
    camTrack.attach(el);
    return () => {
      camTrack.detach(el);
    };
  }, [camTrack]);

  useEffect(() => {
    const el = audioRef.current;
    if (!micTrack || !el) return;
    micTrack.attach(el);
    return () => {
      micTrack.detach(el);
    };
  }, [micTrack]);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-[#161514] border aspect-[4/3] flex items-center justify-center ${
        speaking ? "border-[#C9A44C]" : "border-[#232019]"
      }`}
    >
      {camTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={isLocal ? { transform: "scaleX(-1)" } : undefined}
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-[#232019] text-[#C9A44C] flex items-center justify-center text-[20px] font-bold">
          {initials(p.name || p.identity)}
        </div>
      )}
      {!isLocal && <audio ref={audioRef} autoPlay />}
      <div className="absolute left-2 bottom-2 right-2 flex items-center gap-1.5 text-[11px]">
        <span className="px-2 py-0.5 rounded-full bg-black/60 truncate">
          {isLocal ? "You" : p.name || "Guest"}
        </span>
        {!micOn && <MicOff size={13} className="text-[#E07A66]" />}
      </div>
    </div>
  );
}

export default function CallView({ code, name, onClose }) {
  const roomRef = useRef(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needAudio, setNeedAudio] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: { width: 640, height: 360, frameRate: 24 } },
    });
    roomRef.current = room;

    const bump = () => setTick(t => t + 1);
    [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
    ].forEach(ev => room.on(ev, bump));
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedAudio(!room.canPlaybackAudio));
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) onClose();
    });

    (async () => {
      try {
        const idToken = await getToken();
        const res = await fetch("/api/call", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + idToken },
          body: JSON.stringify({ code, name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.token) throw new Error(data.error || "Couldn't start the call.");
        if (cancelled) return;
        await room.connect(data.url, data.token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        setStatus("live");
        bump();
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          setMicOn(true);
        } catch {
          setMicOn(false);
          setNotice("The microphone is blocked, so others can't hear you. Allow it in your browser's site settings.");
        }
        setNeedAudio(!room.canPlaybackAudio);
        bump();
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e && e.message ? e.message : "Couldn't join the call.");
        }
      }
    })();

    return () => {
      cancelled = true;
      room.removeAllListeners();
      room.disconnect();
    };
  }, [code]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    try {
      const next = !micOn;
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
      setNotice("");
    } catch {
      setNotice("Couldn't use the microphone. Allow it in your browser's site settings.");
    }
  }

  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;
    try {
      const next = !camOn;
      await room.localParticipant.setCameraEnabled(next);
      setCamOn(next);
      setNotice("");
    } catch {
      setNotice("Couldn't use the camera. Allow it in your browser's site settings.");
    }
  }

  async function enableAudio() {
    try {
      await roomRef.current.startAudio();
      setNeedAudio(false);
    } catch {}
  }

  const room = roomRef.current;
  const remotes = room ? Array.from(room.remoteParticipants.values()) : [];
  const speakers = new Set(room ? room.activeSpeakers.map(s => s.identity) : []);
  const count = (status === "live" ? 1 : 0) + remotes.length;

  const circle = "w-12 h-12 rounded-full flex items-center justify-center transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0B0C] text-[#F5F1E8] flex flex-col"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}
    >
      <div className="px-4 py-3 border-b border-[#1E1D1A]">
        <div className="font-bold text-[15px]">Group call</div>
        <div className="text-[11px] text-[#8A8580]">
          {status === "connecting"
            ? "Connecting..."
            : status === "error"
            ? "Not connected"
            : count + (count === 1 ? " person" : " people") + " in the call"}
        </div>
      </div>

      {status === "error" ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="text-[14px] text-[#E07A66]">{error}</div>
          <button
            onClick={onClose}
            className="bg-[#C9A44C] text-[#0B0B0C] rounded-xl px-6 py-2.5 text-[13px] font-semibold"
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3">
            {status === "live" && room && (
              <div className="grid grid-cols-2 gap-2">
                <Tile p={room.localParticipant} isLocal speaking={speakers.has(room.localParticipant.identity)} />
                {remotes.map(p => (
                  <Tile key={p.identity} p={p} speaking={speakers.has(p.identity)} />
                ))}
              </div>
            )}
            {status === "live" && remotes.length === 0 && (
              <div className="text-center text-[13px] text-[#8A8580] mt-6 px-6">
                You're the only one here. Tap Back, then Invite, to bring people in. They will see a Join card in the group.
              </div>
            )}
            {needAudio && (
              <button
                onClick={enableAudio}
                className="mt-4 w-full border border-[#C9A44C]/60 text-[#C9A44C] rounded-xl py-2.5 text-[13px] font-semibold"
              >
                Tap to turn on call sound
              </button>
            )}
            {notice && <div className="mt-4 text-[12px] text-[#E07A66] text-center">{notice}</div>}
          </div>

          <div
            className="flex items-center justify-center gap-5 px-4 pt-3 border-t border-[#1E1D1A]"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={toggleMic}
              disabled={status !== "live"}
              aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
              className={`${circle} ${micOn ? "bg-[#232019] text-[#F5F1E8]" : "bg-[#A13D2D] text-white"} disabled:opacity-40`}
            >
              {micOn ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button
              onClick={toggleCam}
              disabled={status !== "live"}
              aria-label={camOn ? "Turn camera off" : "Turn camera on"}
              className={`${circle} ${camOn ? "bg-[#C9A44C] text-[#0B0B0C]" : "bg-[#232019] text-[#F5F1E8]"} disabled:opacity-40`}
            >
              {camOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              onClick={onClose}
              aria-label="Leave call"
              className={`${circle} bg-[#A13D2D] text-white`}
            >
              <PhoneOff size={20} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
