import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

function VideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = true; p.play(); });
  return <VideoView player={player} style={s.media} nativeControls contentFit="contain" />;
}

// Full-screen viewer. The file link is requested from the API, which checks you own the item.
export default function MediaViewer({ item, onClose }: {
  item: { id: string; type: string; title: string } | null; onClose: () => void;
}) {
  const [file, setFile] = useState<{ type: string; url: string } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setFile(null); setErr('');
    if (!item) return;
    let stop = false;
    api(`/media/${item.id}/access`)
      .then((r) => { if (!stop) setFile(r); })
      .catch((e) => { if (!stop) setErr(e.message); });
    return () => { stop = true; };
  }, [item?.id]);

  return (
    <Modal visible={!!item} animationType="fade" onRequestClose={onClose}>
      <View style={s.wrap}>
        <View style={s.header}>
          <Text style={s.title} numberOfLines={1}>{item?.title}</Text>
          <Pressable onPress={onClose}><Text style={s.close}>Close</Text></Pressable>
        </View>
        <View style={s.body}>
          {!file && !err && <ActivityIndicator color={colors.peach} />}
          {!!err && <Text style={s.err}>{err}</Text>}
          {file?.type === 'IMAGE' && <Image source={{ uri: file.url }} style={s.media} resizeMode="contain" />}
          {file?.type === 'VIDEO' && <VideoPlayer url={file.url} />}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, gap: 12 },
  title: { color: '#fff', fontWeight: '700', fontSize: 16, flex: 1 },
  close: { color: colors.peach, fontWeight: '700' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  media: { width: '100%', height: '100%' },
  err: { color: colors.error, padding: 16, textAlign: 'center' },
});
