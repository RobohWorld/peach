import { useWindowDimensions } from 'react-native';

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const tablet = width >= 600;          // tablets, unfolded foldables
  const wide = width >= 900;            // desktop web, large tablets in landscape
  const landscape = width > height;
  const columns = width >= 1200 ? 3 : tablet ? 2 : 1;
  const contentMax = wide ? 1100 : tablet ? 760 : 520;
  return { width, height, tablet, wide, landscape, columns, contentMax };
}