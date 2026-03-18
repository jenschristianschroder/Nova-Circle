/**
 * Renders a full-screen configuration error when required environment
 * variables are missing (e.g. VITE_AZURE_CLIENT_ID / VITE_AZURE_TENANT_ID).
 */

import styles from './ConfigError.module.css';

export function ConfigError() {
  return (
    <main className={styles.page} role="main">
      <h1 className={styles.heading}>Configuration error</h1>
      <p className={styles.message}>
        <code className={styles.code}>VITE_AZURE_CLIENT_ID</code> and{' '}
        <code className={styles.code}>VITE_AZURE_TENANT_ID</code> must be set before starting the
        application. Please check your <code className={styles.code}>.env</code> file or deployment
        configuration.
      </p>
    </main>
  );
}
