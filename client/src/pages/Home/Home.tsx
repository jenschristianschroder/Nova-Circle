/**
 * Home page — demonstrates the design system with all palettes and modes.
 */

import { useTheme } from '../../design-system/ThemeContext';
import { ThemeSwitcher } from '../../components/ThemeSwitcher';
import { Button } from '../../components/Button';
import styles from './Home.module.css';

export function Home() {
  const { resolvedMode, paletteId } = useTheme();

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header} role="banner">
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <span className={styles.brandIcon} aria-hidden="true">
              ◎
            </span>
            <span className={styles.brandName}>Nova-Circle</span>
          </div>
          <nav aria-label="Primary navigation">
            <ul className={styles.navList}>
              <li>
                <a href="#groups" className={styles.navLink}>
                  Groups
                </a>
              </li>
              <li>
                <a href="#events" className={styles.navLink}>
                  Events
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main id="main-content" className={styles.main}>
        {/* Hero */}
        <section className={styles.hero} aria-labelledby="hero-heading">
          <h1 id="hero-heading" className={styles.heroTitle}>
            Your private group calendar
          </h1>
          <p className={styles.heroSubtitle}>
            Organise events with friends and family. Privacy-first, no tracking.
          </p>
          <div className={styles.heroActions}>
            <Button variant="primary" size="lg">
              Get started
            </Button>
            <Button variant="secondary" size="lg">
              Learn more
            </Button>
          </div>
        </section>

        {/* Appearance settings */}
        <section className={styles.section} aria-labelledby="appearance-heading">
          <div className={styles.card}>
            <h2 id="appearance-heading" className={styles.sectionTitle}>
              Appearance
            </h2>
            <p className={styles.sectionSubtitle}>
              Currently: <strong>{resolvedMode} mode</strong> with{' '}
              <strong>{paletteId} palette</strong>
            </p>
            <ThemeSwitcher />
          </div>
        </section>

        {/* Component showcase */}
        <section className={styles.section} aria-labelledby="components-heading">
          <h2 id="components-heading" className={styles.sectionTitle}>
            Component showcase
          </h2>

          {/* Buttons */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Buttons</h3>
            <div className={styles.showcase}>
              <div className={styles.showcaseRow}>
                <Button variant="primary" size="sm">
                  Small
                </Button>
                <Button variant="primary" size="md">
                  Medium
                </Button>
                <Button variant="primary" size="lg">
                  Large
                </Button>
              </div>
              <div className={styles.showcaseRow}>
                <Button variant="secondary">Secondary</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="primary" disabled>
                  Disabled
                </Button>
              </div>
            </div>
          </div>

          {/* Typography */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Typography</h3>
            <div className={styles.typographyShowcase}>
              <h1>Heading 1 — 2rem</h1>
              <h2>Heading 2 — 1.563rem</h2>
              <h3>Heading 3 — 1.25rem</h3>
              <h4>Heading 4 — 1rem</h4>
              <p>
                Body text — system-ui. Nova-Circle keeps your events and group activity private.
                Only explicitly invited members can see event details.
              </p>
              <small>Small text — secondary colour</small>
            </div>
          </div>

          {/* Colour palette */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Semantic colour tokens</h3>
            <div className={styles.tokenGrid} role="list" aria-label="Colour token swatches">
              <TokenSwatch label="surface.background" cssVar="--nc-surface-background" />
              <TokenSwatch label="surface.card" cssVar="--nc-surface-card" />
              <TokenSwatch label="surface.subtle" cssVar="--nc-surface-subtle" />
              <TokenSwatch label="accent.default" cssVar="--nc-accent-default" />
              <TokenSwatch label="accent.hover" cssVar="--nc-accent-hover" />
              <TokenSwatch label="accent.subtle" cssVar="--nc-accent-subtle" />
              <TokenSwatch label="danger.default" cssVar="--nc-danger-default" />
              <TokenSwatch label="success.default" cssVar="--nc-success-default" />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={styles.footer} role="contentinfo">
        <p className={styles.footerText}>
          Nova-Circle — privacy-first group calendar. No tracking. No ads.
        </p>
      </footer>
    </div>
  );
}

/** Small helper to render a colour token swatch with its name. */
function TokenSwatch({ label, cssVar }: { label: string; cssVar: string }) {
  return (
    <div className={styles.tokenSwatch} role="listitem">
      <span
        className={styles.tokenSwatchColour}
        style={{ backgroundColor: `var(${cssVar})` }}
        aria-hidden="true"
      />
      <span className={styles.tokenSwatchLabel}>{label}</span>
    </div>
  );
}
