import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ isDarkMode: false, toggleDark: () => {} });

export function ThemeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(
    () => localStorage.getItem('theme') === 'dark'
  );

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkMode ? 'dark' : '';
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleDark = useCallback(() => setIsDarkMode((v) => !v), []);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
