/**
 * Event creation page — allows creating a new event via a structured form
 * or via the text-based capture pipeline.
 *
 * The capture pipeline returns either an eventId (success) or a draftId
 * with structured issue codes (needs user review). This page handles both.
 */

import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApiClient } from '../../api/client';
import { createEvent, captureEventFromText } from '../../api/events';
import { Button } from '../../components/Button';
import styles from './EventCreate.module.css';

type CreateMode = 'form' | 'capture';

export function EventCreate() {
  const { groupId } = useParams<{ groupId: string }>();
  const { apiFetch } = useApiClient();
  const navigate = useNavigate();

  const [mode, setMode] = useState<CreateMode>('form');

  /* ── Form state ─────────────────────────────────────────────────── */
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /* ── Capture state ──────────────────────────────────────────────── */
  const [captureText, setCaptureText] = useState('');
  const [captureIssues, setCaptureIssues] = useState<string[]>([]);
  const [captureError, setCaptureError] = useState<string | null>(null);

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !title.trim() || !startAt) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      const event = await createEvent(apiFetch, groupId, {
        title: title.trim(),
        startAt: new Date(startAt).toISOString(),
        endAt: endAt ? new Date(endAt).toISOString() : undefined,
        description: description.trim() || undefined,
      });
      navigate(`/groups/${groupId}/events/${event.id}`);
    } catch {
      setFormError('Failed to create event. Please check your inputs and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCapture(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !captureText.trim()) return;
    setIsSubmitting(true);
    setCaptureError(null);
    setCaptureIssues([]);
    try {
      const result = await captureEventFromText(apiFetch, {
        groupId,
        text: captureText.trim(),
      });
      if (result.success) {
        navigate(`/groups/${groupId}/events/${result.eventId}`);
      } else if (result.issues.length > 0) {
        setCaptureIssues(result.issues);
      } else {
        setCaptureError('Could not extract event details. Please try the structured form.');
      }
    } catch {
      setCaptureError('Capture failed. Please try the structured form.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main id="main-content" className={styles.page}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link to="/groups" className={styles.breadcrumbLink}>
          Groups
        </Link>
        <span aria-hidden="true" className={styles.breadcrumbSep}>
          ›
        </span>
        <Link to={`/groups/${groupId}`} className={styles.breadcrumbLink}>
          Group
        </Link>
        <span aria-hidden="true" className={styles.breadcrumbSep}>
          ›
        </span>
        <span aria-current="page">New Event</span>
      </nav>

      <h1 className={styles.heading}>Create event</h1>

      {/* Mode switcher */}
      <div className={styles.modeTabs} role="tablist" aria-label="Event creation mode">
        <button
          id="form-tab"
          role="tab"
          type="button"
          className={[styles.modeTab, mode === 'form' ? styles.modeTabActive : '']
            .filter(Boolean)
            .join(' ')}
          aria-selected={mode === 'form'}
          aria-controls="form-panel"
          tabIndex={mode === 'form' ? 0 : -1}
          onClick={() => setMode('form')}
        >
          Structured form
        </button>
        <button
          id="capture-tab"
          role="tab"
          type="button"
          className={[styles.modeTab, mode === 'capture' ? styles.modeTabActive : '']
            .filter(Boolean)
            .join(' ')}
          aria-selected={mode === 'capture'}
          aria-controls="capture-panel"
          tabIndex={mode === 'capture' ? 0 : -1}
          onClick={() => setMode('capture')}
        >
          Describe in text
        </button>
      </div>

      {/* Structured form */}
      {mode === 'form' && (
        <section
          id="form-panel"
          role="tabpanel"
          aria-labelledby="form-tab"
          className={styles.formCard}
        >
          <form onSubmit={(e) => void handleFormSubmit(e)} noValidate>
            <div className={styles.field}>
              <label htmlFor="event-title" className={styles.label}>
                Title <span aria-hidden="true">*</span>
              </label>
              <input
                id="event-title"
                type="text"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Summer BBQ"
                required
                aria-required="true"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="event-start" className={styles.label}>
                Start date & time <span aria-hidden="true">*</span>
              </label>
              <input
                id="event-start"
                type="datetime-local"
                className={styles.input}
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="event-end" className={styles.label}>
                End date & time
              </label>
              <input
                id="event-end"
                type="datetime-local"
                className={styles.input}
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="event-description" className={styles.label}>
                Description
              </label>
              <textarea
                id="event-description"
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional details about the event"
              />
            </div>

            {formError && (
              <p className={styles.errorText} role="alert">
                {formError}
              </p>
            )}

            <div className={styles.formActions}>
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || !title.trim() || !startAt}
              >
                {isSubmitting ? 'Creating…' : 'Create event'}
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Text capture */}
      {mode === 'capture' && (
        <section
          id="capture-panel"
          role="tabpanel"
          aria-labelledby="capture-tab"
          className={styles.formCard}
        >
          <p className={styles.captureHint}>
            Describe your event in plain text — the date, time, and title will be extracted
            automatically.
          </p>
          <form onSubmit={(e) => void handleCapture(e)} noValidate>
            <div className={styles.field}>
              <label htmlFor="capture-text" className={styles.label}>
                Event description <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="capture-text"
                className={styles.textarea}
                value={captureText}
                onChange={(e) => setCaptureText(e.target.value)}
                rows={5}
                placeholder='e.g. "BBQ at our place on Saturday 14 June at 3pm"'
                required
                aria-required="true"
              />
            </div>

            {captureIssues.length > 0 && (
              <div className={styles.issueBox} role="alert">
                <p className={styles.issueTitle}>Could not extract all event details:</p>
                <ul className={styles.issueList}>
                  {captureIssues.map((issue) => (
                    <li key={issue}>{issue.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
                <p>Please provide more detail or switch to the structured form.</p>
              </div>
            )}

            {captureError && (
              <p className={styles.errorText} role="alert">
                {captureError}
              </p>
            )}

            <div className={styles.formActions}>
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || !captureText.trim()}
              >
                {isSubmitting ? 'Processing…' : 'Create from text'}
              </Button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
