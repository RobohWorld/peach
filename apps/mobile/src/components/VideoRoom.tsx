import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';
import { AudioSession, LiveKitRoom, VideoTrack, isTrackReference, useTracks } from '@livekit/react-native';
import { Room, RoomEvent, Track } from 'livekit-client';

type Props = {
  url: string; token: string; publish: boolean;
  onMessage: (m: any) => void;
  onDisconnected: () => void;
  /** Called with the number of viewers whenever someone joins or leaves. */
  onCount?: (n: number) => void;
};

function decode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  try { return decodeURIComponent(escape(s)); } catch { return s; }
}

function Stage() {
  const tracks = useTracks([Track.Source.Camera]);
  const ref = tracks.find((t) => isTrackReference(t));
  if (!ref || !isTrackReference(ref)) {
    return <View style={s.fill}><Text style={s.note}>Waiting for video...</Text></View>;
  }
  return <VideoTrack trackRef={ref} style={s.fill} />;
}

export default function VideoRoom({ url, token, publish, onMessage, onDisconnected, onCount }: Props) {
  const room = useMemo(() => new Room(), []);
  const [perm, setPerm] = useState<'pending' | 'ok' | 'denied'>(publish && Platform.OS === 'android' ? 'pending' : 'ok');
  const onMsg = useRef(onMessage); onMsg.current = onMessage;
  const onDisc = useRef(onDisconnected); onDisc.current = onDisconnected;
  const onCnt = useRef(onCount); onCnt.current = onCount;

  useEffect(() => {
    if (!publish || Platform.OS !== 'android') return;
    PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]).then((r) => {
      const ok = Object.values(r).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
      setPerm(ok ? 'ok' : 'denied');
    }).catch(() => setPerm('denied'));
  }, [publish]);

  useEffect(() => {
    AudioSession.startAudioSession();
    // Only the server (no participant) can send chat, gift or system events.
    const handler = (payload: Uint8Array, participant?: unknown) => {
      if (participant) return;
      try { onMsg.current(JSON.parse(decode(payload))); } catch {}
    };
    // Everyone else in the room (the host counts as one for viewers, so this equals the viewer count).
    const count = () => onCnt.current?.(room.remoteParticipants.size);
    room.on(RoomEvent.DataReceived, handler as any);
    room.on(RoomEvent.Connected, count);
    room.on(RoomEvent.ParticipantConnected, count);
    room.on(RoomEvent.ParticipantDisconnected, count);
    return () => {
      room.off(RoomEvent.DataReceived, handler as any);
      room.off(RoomEvent.Connected, count);
      room.off(RoomEvent.ParticipantConnected, count);
      room.off(RoomEvent.ParticipantDisconnected, count);
      AudioSession.stopAudioSession();
    };
  }, [room]);

  if (perm === 'pending') return <View style={s.fill}><Text style={s.note}>Requesting camera and microphone...</Text></View>;
  if (perm === 'denied') return <View style={s.fill}><Text style={s.note}>Camera and microphone permission is needed to go live. Enable it in Settings.</Text></View>;

  return (
    <LiveKitRoom
      room={room}
      serverUrl={url}
      token={token}
      connect={true}
      audio={publish}
      video={publish}
      onDisconnected={() => onDisc.current()}
    >
      <Stage />
    </LiveKitRoom>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 16 },
  note: { color: '#fff', textAlign: 'center' },
});
