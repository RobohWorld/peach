import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { api } from './api';

export const MAX_VIDEO_SECONDS = 15;
const MAX_IMAGE_WIDTH = 1600;
const PREVIEW_WIDTH = 48; // tiny on purpose: the server never exposes the full image before purchase
const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];

export type Picked = {
  kind: 'IMAGE' | 'VIDEO';
  uri: string;
  mimeType: string;
  width?: number;
  durationSec?: number;
};

import * as VideoThumbnails from 'expo-video-thumbnails';

async function videoPreviewUri(uri: string): Promise<string | undefined> {
  if (Platform.OS === 'web') return undefined;          // not supported on web: falls back to the 🎬 placeholder
  try {
    const { uri: frame } = await VideoThumbnails.getThumbnailAsync(uri, { time: 500, quality: 0.5 });
    return await toJpeg(frame, PREVIEW_WIDTH, 0.5);     // same 48px blur-source as photos
  } catch { return undefined; }                          // a failed thumbnail never blocks the upload
}

// Works with both the newer and the older expo-image-manipulator API.
async function toJpeg(uri: string, width: number | undefined, compress: number): Promise<string> {
  const M: any = ImageManipulator;
  if (typeof M.manipulateAsync === 'function') {
    const r = await M.manipulateAsync(uri, width ? [{ resize: { width } }] : [], { compress, format: M.SaveFormat.JPEG });
    return r.uri;
  }
  const ctx = M.ImageManipulator.manipulate(uri);
  if (width) ctx.resize({ width });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress, format: M.SaveFormat.JPEG });
  return out.uri;
}

function webVideoDuration(uri: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    try {
      const v = (globalThis as any).document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : undefined);
      v.onerror = () => resolve(undefined);
      v.src = uri;
    } catch { resolve(undefined); }
  });
}

/** Opens the photo/video library. Returns null if cancelled; throws a readable error for unsupported files. */
export async function pickMedia(): Promise<Picked | null> {
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 1,
    videoMaxDuration: MAX_VIDEO_SECONDS,
  });
  if (r.canceled || !r.assets?.[0]) return null;
  const a: any = r.assets[0];

  if (a.type === 'video') {
    const mimeType: string = a.mimeType ?? 'video/mp4';
    if (!VIDEO_TYPES.includes(mimeType)) throw new Error('Please choose an MP4 or MOV video');
    let seconds: number | undefined = typeof a.duration === 'number' ? a.duration / 1000 : undefined;
    if (seconds === undefined && Platform.OS === 'web') seconds = await webVideoDuration(a.uri);
    if (seconds === undefined) throw new Error('Could not read the video length');
    if (seconds > MAX_VIDEO_SECONDS + 0.5) throw new Error(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds`);
    return { kind: 'VIDEO', uri: a.uri, mimeType, durationSec: Math.min(MAX_VIDEO_SECONDS, Math.max(1, Math.round(seconds))) };
  }
  return { kind: 'IMAGE', uri: a.uri, mimeType: 'image/jpeg', width: a.width };
}

async function putBlob(url: string, blob: Blob, contentType: string) {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

/** Uploads straight to storage, then registers the item. Photos are re-encoded as JPEG (this also removes location data). */
export async function uploadMedia(
  p: Picked, title: string, priceCoins: number | null, minTier: number | null, progress: (step: string) => void,
): Promise<{ id: string; status: string }> {
  progress('Preparing...');
  let mainUri = p.uri;
  let contentType = p.mimeType;
  let previewUri: string | undefined;

  if (p.kind === 'IMAGE') {
    mainUri = await toJpeg(p.uri, p.width && p.width > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH : undefined, 0.85);
    previewUri = await toJpeg(p.uri, PREVIEW_WIDTH, 0.5);
    contentType = 'image/jpeg';
  }
  else {
    previewUri = await videoPreviewUri(p.uri);
  }

  const mainBlob = await (await fetch(mainUri)).blob();
  const previewBlob = previewUri ? await (await fetch(previewUri)).blob() : null;

  progress('Uploading...');
  const up = await api('/media/upload-url', {
    method: 'POST',
    body: {
      type: p.kind, contentType, size: mainBlob.size,
      ...(previewBlob ? { previewSize: previewBlob.size } : {}),
    },
  });
  await putBlob(up.uploadUrl, mainBlob, contentType);
  if (previewBlob) await putBlob(up.previewUploadUrl, previewBlob, 'image/jpeg');

  progress('Saving...');
  return api('/media', {
    method: 'POST',
    body: {
      type: p.kind, mediaKey: up.mediaKey, title,
      ...(priceCoins !== null ? { priceCoins } : {}),
      ...(minTier !== null ? { minTier } : {}),
      ...(up.previewKey ? { previewKey: up.previewKey } : {}),
      ...(p.kind === 'VIDEO' ? { durationSec: p.durationSec } : {}),
    },
  });
}
