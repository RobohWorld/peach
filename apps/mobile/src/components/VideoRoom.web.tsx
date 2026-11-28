import React, { useEffect, useRef } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

type Props = {
  url: string; token: string; publish: boolean;
  onMessage: (m: any) => void;
  onDisconnected: () => void;
  onCount?: (n: number) => void;
};

export default function VideoRoom({ url, token, publish, onMessage, onDisconnected, onCount }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onMsg = useRef(onMessage);
  const onDisc = useRef(onDisconnected);
  const onCnt = useRef(onCount);
  onMsg.current = onMessage;
  onDisc.current = onDisconnected;
  onCnt.current = onCount;

  useEffect(() => {
    const room = new Room();
    const audioEls: HTMLElement[] = [];
    let closed = false;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video && videoRef.current) track.attach(videoRef.current);
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        document.body.appendChild(el);
        audioEls.push(el);
      }
    });

    // Only the server (no participant) can send chat, gift or system events.
    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant) => {
      if (participant) return;
      try { onMsg.current(JSON.parse(new TextDecoder().decode(payload))); } catch {}
    });

    const count = () => onCnt.current?.(room.remoteParticipants.size);
    room.on(RoomEvent.Connected, count);
    room.on(RoomEvent.ParticipantConnected, count);
    room.on(RoomEvent.ParticipantDisconnected, count);

    room.on(RoomEvent.Disconnected, () => { if (!closed) onDisc.current(); });

    (async () => {
      await room.connect(url, token);
      if (publish) {
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);
        const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (pub?.track && videoRef.current) pub.track.attach(videoRef.current);
      }
    })().catch((e) => console.error('LiveKit error', e));

    return () => {
      closed = true;
      audioEls.forEach((el) => el.remove());
      room.disconnect();
    };
  }, [url, token, publish]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={publish}
      style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' }}
    />
  );
}
