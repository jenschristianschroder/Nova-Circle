/**
 * Home page — demonstrates the design system with all palettes and modes.
 *
 * Migrated to Tailwind utility classes.
 */

import { useTheme } from '../../design-system/ThemeContext';
import { ThemeSwitcher } from '../../components/ThemeSwitcher';
import { Button } from '../../components/Button';
import { Card } from '../../components/ui';

export function Home() {
  const { resolvedMode, paletteId } = useTheme();

  return (
    <div className="flex min-h-dvh flex-col bg-nc-surface-background text-nc-content-primary">
      {/* Header */}
      <header role="banner" className="border-b border-nc-border-default bg-nc-surface-card">
        <div className="mx-auto flex max-w-5xl items-center px-nc-md py-nc-sm md:px-nc-lg">
          <div className="flex items-center gap-nc-sm">
            <span className="text-2xl text-nc-accent-default" aria-hidden="true">
              {'◎'}
            </span>
            <span className="text-nc-lg font-semibold tracking-tight">Nova-Circle</span>
          </div>
          <nav aria-label="Primary navigation" className="ml-auto">
            <ul className="flex gap-nc-md">
              <li>
                <a
                  href="#groups"
                  className="text-nc-sm font-medium text-nc-content-secondary no-underline hover:text-nc-content-primary"
                >
                  Groups
                </a>
              </li>
              <li>
                <a
                  href="#events"
                  className="text-nc-sm font-medium text-nc-content-secondary no-underline hover:text-nc-content-primary"
                >
                  Events
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main
        id="main-content"
        className="mx-auto w-full max-w-5xl flex-1 px-nc-md py-nc-2xl md:px-nc-lg"
      >
        <div className="flex flex-col gap-nc-2xl">
          {/* Hero */}
          <section
            aria-labelledby="hero-heading"
            className="flex flex-col items-center gap-nc-lg py-nc-3xl text-center"
          >
            <h1
              id="hero-heading"
              className="max-w-[28ch] text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.15] tracking-tight"
            >
              Your private group calendar
            </h1>
            <p className="max-w-[44ch] text-lg leading-relaxed text-nc-content-secondary">
              Organise events with friends and family. Privacy-first, no tracking.
            </p>
            <div className="flex flex-wrap justify-center gap-nc-md">
              <Button variant="primary" size="lg">
                Get started
              </Button>
              <Button variant="secondary" size="lg">
                Learn more
              </Button>
            </div>
          </section>

          {/* Appearance settings */}
          <section aria-labelledby="appearance-heading">
            <Card>
              <h2 id="appearance-heading" className="text-nc-xl font-semibold">
                Appearance
              </h2>
              <p className="mt-nc-xs text-nc-content-secondary">
                Currently: <strong>{resolvedMode} mode</strong> with{' '}
                <strong>{paletteId} palette</strong>
              </p>
              <div className="mt-nc-md">
                <ThemeSwitcher />
              </div>
            </Card>
          </section>

          {/* Component showcase */}
          <section aria-labelledby="components-heading" className="flex flex-col gap-nc-lg">
            <h2 id="components-heading" className="text-nc-xl font-semibold">
              Component showcase
            </h2>

            <Card>
              <h3 className="mb-nc-md text-nc-lg font-semibold">Buttons</h3>
              <div className="flex flex-col gap-nc-md">
                <div className="flex flex-wrap items-center gap-nc-sm">
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
                <div className="flex flex-wrap items-center gap-nc-sm">
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="danger">Danger</Button>
                  <Button variant="primary" disabled>
                    Disabled
                  </Button>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="mb-nc-md text-nc-lg font-semibold">Typography</h3>
              <div className="flex flex-col gap-nc-sm">
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
            </Card>

            <Card>
              <h3 className="mb-nc-md text-nc-lg font-semibold">Semantic colour tokens</h3>
              <div
                className="grid grid-cols-2 gap-nc-sm sm:grid-cols-4"
                role="list"
                aria-label="Colour token swatches"
              >
                <TokenSwatch label="surface.background" cssVar="--nc-surface-background" />
                <TokenSwatch label="surface.card" cssVar="--nc-surface-card" />
                <TokenSwatch label="surface.subtle" cssVar="--nc-surface-subtle" />
                <TokenSwatch label="accent.default" cssVar="--nc-accent-default" />
                <TokenSwatch label="accent.hover" cssVar="--nc-accent-hover" />
                <TokenSwatch label="accent.subtle" cssVar="--nc-accent-subtle" />
                <TokenSwatch label="danger.default" cssVar="--nc-danger-default" />
                <TokenSwatch label="success.default" cssVar="--nc-success-default" />
              </div>
            </Card>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer
        role="contentinfo"
        className="border-t border-nc-border-default bg-nc-surface-card py-nc-lg text-center"
      >
        <p className="text-nc-sm text-nc-content-secondary">
          Nova-Circle — privacy-first group calendar. No tracking. No ads.
        </p>
      </footer>
    </div>
  );
}

function TokenSwatch({ label, cssVar }: { label: string; cssVar: string }) {
  return (
    <div className="flex items-center gap-nc-sm" role="listitem">
      <span
        className="h-8 w-8 shrink-0 rounded-nc-sm"
        style={{ backgroundColor: `var(${cssVar})` }}
        aria-hidden="true"
      />
      <span className="text-nc-xs text-nc-content-secondary">{label}</span>
    </div>
  );
}
