/**
 * Login page — shown to unauthenticated users.
 *
 * Displays a brief product description and a "Sign in" button that triggers
 * the MSAL redirect login flow. No personal data is rendered or stored here.
 */

import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import styles from './Login.module.css';

export function Login() {
  const { login } = useAuth();

  return (
    <div className={styles.page}>
      <header className={styles.header} role="banner">
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <span className={styles.brandIcon} aria-hidden="true">
              ◎
            </span>
            <span className={styles.brandName}>Nova-Circle</span>
          </div>
        </div>
      </header>

      <main id="main-content" className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <h1 id="hero-heading" className={styles.heroTitle}>
            Your private group calendar
          </h1>
          <p className={styles.heroSubtitle}>
            Organise events with friends and family. Privacy-first, no tracking.
          </p>
          <div className={styles.heroActions}>
            <Button variant="primary" size="lg" onClick={() => void login()}>
              Sign in
            </Button>
          </div>
        </section>

        <section className={styles.features} aria-labelledby="features-heading">
          <h2 id="features-heading" className={styles.featuresHeading}>
            What Nova-Circle offers
          </h2>
          <ul className={styles.featureList} role="list">
            <li className={styles.featureItem}>
              <span className={styles.featureIcon} aria-hidden="true">
                🗓
              </span>
              <div>
                <strong>Event scheduling</strong>
                <p>Create events with a text description, voice note, or photo.</p>
              </div>
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon} aria-hidden="true">
                🔒
              </span>
              <div>
                <strong>Explicit invitations</strong>
                <p>Only people you explicitly invite can see your event details.</p>
              </div>
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon} aria-hidden="true">
                💬
              </span>
              <div>
                <strong>Event chat & checklists</strong>
                <p>Coordinate directly within each event — no separate apps needed.</p>
              </div>
            </li>
          </ul>
        </section>
      </main>

      <footer className={styles.footer} role="contentinfo">
        <p className={styles.footerText}>Nova-Circle — privacy-first. No tracking. No ads.</p>
      </footer>
    </div>
  );
}
