import React, { useEffect, useRef } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

type Props = {
  url: string; token: string; publish: boolean;
  onMessage: (m: any) => void;
  registerSender: (fn: (m: any) => void) => void;
};

export default function VideoRoom({ url, token, publish, onMessage, registerSender }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const room = new Room();
    const audioEls: HTMLElement[] = [];

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video && videoRef.current) track.attach(videoRef.current);
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        document.body.appendChild(el);
        audioEls.push(el);
      }
    });

    room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      try { onMessage(JSON.parse(new TextDecoder().decode(payload))); } catch {}
    });

    registerSender((m) => {
      room.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify(m)), { reliable: true })
        .catch(() => {});
    });

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
