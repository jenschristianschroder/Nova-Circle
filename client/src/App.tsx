/**
 * App root component.
 * Wraps the application in ThemeProvider and renders the skip link + main page.
 */

import { ThemeProvider } from './design-system/ThemeContext';
import { SkipLink } from './components/SkipLink';
import { Home } from './pages/Home';
import './design-system/global.css';

export function App() {
  return (
    <ThemeProvider>
      <SkipLink />
      <Home />
    </ThemeProvider>
  );
}
