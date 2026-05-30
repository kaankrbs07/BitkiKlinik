import { useColorScheme as useNativeColorScheme } from 'react-native';
import { useThemeStore } from '../store/useThemeStore';

export function useAppTheme() {
  const systemScheme = useNativeColorScheme();
  const userTheme = useThemeStore((state) => state.theme);
  
  // Resolve actual theme: system-matching or explicit user selection
  const resolvedTheme = userTheme === 'system' ? (systemScheme ?? 'light') : userTheme;
  
  return {
    theme: userTheme, // 'light' | 'dark' | 'system'
    resolvedTheme, // 'light' | 'dark'
    isDark: resolvedTheme === 'dark',
    setTheme: useThemeStore((state) => state.setTheme),
  };
}
