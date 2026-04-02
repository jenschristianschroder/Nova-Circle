/**
 * Event creation page — allows creating a new event via a structured form
 * or via the text-based capture pipeline.
 *
 * Mobile-first single-column layout with tabbed mode switching.
 */

import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApiClient } from '../../api/client';
import { createEvent, captureEventFromText } from '../../api/events';
import { Button } from '../../components/Button';
import { Card, Input, Textarea, Label } from '../../components/ui';
import { cn } from '../../components/ui/cn';

type CreateMode = 'form' | 'capture';

export function EventCreate() {
  const { groupId } = useParams<{ groupId: string }>();
  const { apiFetch } = useApiClient();
  const navigate = useNavigate();

  const [mode, setMode] = useState<CreateMode>('form');

  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    <main
      id="main-content"
      className="mx-auto flex max-w-2xl flex-col gap-nc-lg px-nc-md py-nc-xl md:py-nc-2xl"
    >
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-nc-xs text-nc-sm text-nc-content-secondary"
      >
        <Link to="/groups" className="text-nc-accent-default no-underline hover:underline">
          Groups
        </Link>
        <span aria-hidden="true">›</span>
        <Link
          to={`/groups/${groupId}`}
          className="text-nc-accent-default no-underline hover:underline"
        >
          Group
        </Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">New Event</span>
      </nav>

      <h1 className="text-nc-2xl font-bold">Create event</h1>

      {/* Mode switcher */}
      <div
        className="flex self-start overflow-hidden rounded-nc-sm border border-nc-border-default"
        role="tablist"
        aria-label="Event creation mode"
      >
        <button
          id="form-tab"
          role="tab"
          type="button"
          className={cn(
            'border-r border-nc-border-default px-nc-lg py-nc-sm text-nc-sm font-medium transition-colors',
            'cursor-pointer',
            mode === 'form'
              ? 'bg-nc-accent-default text-nc-content-on-accent'
              : 'bg-nc-surface-card text-nc-content-secondary hover:bg-nc-surface-subtle',
          )}
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
          className={cn(
            'px-nc-lg py-nc-sm text-nc-sm font-medium transition-colors',
            'cursor-pointer',
            mode === 'capture'
              ? 'bg-nc-accent-default text-nc-content-on-accent'
              : 'bg-nc-surface-card text-nc-content-secondary hover:bg-nc-surface-subtle',
          )}
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
        <Card>
          <form
            id="form-panel"
            role="tabpanel"
            aria-labelledby="form-tab"
            onSubmit={(e) => void handleFormSubmit(e)}
            noValidate
          >
            <div className="mb-nc-md flex flex-col gap-nc-xs">
              <Label htmlFor="event-title">
                Title <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="event-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Summer BBQ"
                required
                aria-required="true"
              />
            </div>

            <div className="mb-nc-md flex flex-col gap-nc-xs">
              <Label htmlFor="event-start">
                Start date & time <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="event-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div className="mb-nc-md flex flex-col gap-nc-xs">
              <Label htmlFor="event-end">End date & time</Label>
              <Input
                id="event-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>

            <div className="mb-nc-md flex flex-col gap-nc-xs">
              <Label htmlFor="event-description">Description</Label>
              <Textarea
                id="event-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional details about the event"
              />
            </div>

            {formError && (
              <p className="mb-nc-md text-nc-sm text-nc-danger-default" role="alert">
                {formError}
              </p>
            )}

            <div className="mt-nc-lg flex justify-end gap-nc-md">
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
        </Card>
      )}

      {/* Text capture */}
      {mode === 'capture' && (
        <Card>
          <div id="capture-panel" role="tabpanel" aria-labelledby="capture-tab">
            <p className="mb-nc-md text-nc-sm text-nc-content-secondary">
              Describe your event in plain text — the date, time, and title will be extracted
              automatically.
            </p>
            <form onSubmit={(e) => void handleCapture(e)} noValidate>
              <div className="mb-nc-md flex flex-col gap-nc-xs">
                <Label htmlFor="capture-text">
                  Event description <span aria-hidden="true">*</span>
                </Label>
                <Textarea
                  id="capture-text"
                  value={captureText}
                  onChange={(e) => setCaptureText(e.target.value)}
                  rows={5}
                  placeholder='e.g. "BBQ at our place on Saturday 14 June at 3pm"'
                  required
                  aria-required="true"
                />
              </div>

              {captureIssues.length > 0 && (
                <div
                  className="mb-nc-md rounded-nc-sm border border-nc-danger-default bg-nc-danger-subtle p-nc-md text-nc-sm"
                  role="alert"
                >
                  <p className="mb-nc-xs font-semibold">Could not extract all event details:</p>
                  <ul className="ml-nc-md list-disc">
                    {captureIssues.map((issue) => (
                      <li key={issue}>{issue.replace(/_/g, ' ')}</li>
                    ))}
                  </ul>
                  <p className="mt-nc-sm">
                    Please provide more detail or switch to the structured form.
                  </p>
                </div>
              )}

              {captureError && (
                <p className="mb-nc-md text-nc-sm text-nc-danger-default" role="alert">
                  {captureError}
                </p>
              )}

              <div className="mt-nc-lg flex justify-end gap-nc-md">
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
          </div>
        </Card>
      )}
    </main>
  );
}
