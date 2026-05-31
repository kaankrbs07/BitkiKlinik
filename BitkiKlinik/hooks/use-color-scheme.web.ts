import { useEffect, useState } from 'react';
import { useAppTheme } from './useAppTheme';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const { resolvedTheme } = useAppTheme();

  if (hasHydrated) {
    return resolvedTheme;
  }

  return 'light';
}
