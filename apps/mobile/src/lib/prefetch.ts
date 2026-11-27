import { Image } from 'react-native';

export function prefetchImages(urls: (string | null | undefined)[]) {
  urls.forEach((u) => { if (u) Image.prefetch(u).catch(() => {}); });
}