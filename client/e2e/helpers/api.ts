/**
 * API helper for E2E tests.
 *
 * Provides a thin typed wrapper around the Nova-Circle backend REST API so
 * that tests can seed and tear down known data deterministically without
 * relying on the UI.
 *
 * Authentication uses the real bearer token extracted from the Playwright
 * storage state (the same token that the browser would use). This means E2E
 * runs against the deployed site work identically to local runs – no
 * X-Test-* header bypass is required or used.
 *
 * Usage:
 *   const api = ApiHelper.fromStorageState();
 *   const group = await api.createGroup({ name: 'My Group' });
 *   // … run tests …
 *   await api.deleteGroup(group.id);
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Default path to the auth state written by global-setup.ts. */
const DEFAULT_AUTH_STATE_PATH = path.join(__dirname, '..', '.auth', 'user.json');

// ── Domain types (mirrors backend DTOs) ─────────────────────────────────────

/** Minimal shape of a Playwright storage state file. */
interface StorageState {
  cookies: Array<{ name: string; value: string }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

export interface GroupSummary {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
}

export interface EventSummary {
  id: string;
  title: string;
  startAt: string;
  endAt?: string;
  groupId: string;
  createdBy: string;
}

export interface CreateGroupPayload {
  name: string;
  description?: string;
}

export interface CreateEventPayload {
  title: string;
  startAt: string;
  endAt?: string;
  description?: string;
  groupId: string;
}

// ── Helper class ─────────────────────────────────────────────────────────────

export class ApiHelper {
  private readonly baseUrl: string;
  private readonly bearerToken: string;

  private constructor(baseUrl: string, bearerToken: string) {
    this.baseUrl = baseUrl;
    this.bearerToken = bearerToken;
  }

  /**
   * Constructs an ApiHelper by extracting the bearer token from the Playwright
   * storage state file written by global-setup.ts.
   *
   * The MSAL library stores the access token in localStorage under a key that
   * contains the word "accesstoken". We search all origins for such an entry.
   *
   * @param storageStatePath - Optional override for the storage state file path.
   * @param baseUrl          - Optional override for the API base URL.
   */
  static fromStorageState(storageStatePath?: string, baseUrl?: string): ApiHelper {
    const statePath = storageStatePath ?? DEFAULT_AUTH_STATE_PATH;
    const resolvedBaseUrl =
      baseUrl ?? process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:5173';

    const raw = fs.readFileSync(statePath, 'utf-8');
    const state: StorageState = JSON.parse(raw) as StorageState;

    // Search localStorage across all origins for the MSAL access token entry.
    // MSAL (@azure/msal-browser) persists access tokens under keys of the form:
    //   <clientId>.<tenantId>-login.windows.net-accesstoken-<scope>--
    // The key always contains the literal string "accesstoken" (case-insensitive).
    // The value is a JSON object with a `secret` property containing the JWT.
    // This covers both msal-browser v2 and v3 storage formats.
    let bearerToken = '';
    for (const origin of state.origins) {
      for (const entry of origin.localStorage) {
        if (entry.name.toLowerCase().includes('accesstoken')) {
          try {
            const parsed: unknown = JSON.parse(entry.value);
            if (
              parsed !== null &&
              typeof parsed === 'object' &&
              'secret' in parsed &&
              typeof (parsed as { secret: unknown }).secret === 'string'
            ) {
              bearerToken = (parsed as { secret: string }).secret;
              break;
            }
          } catch {
            // Not a JSON value; skip.
          }
        }
      }
      if (bearerToken) break;
    }

    return new ApiHelper(resolvedBaseUrl, bearerToken);
  }

  // ── Private fetch helper ───────────────────────────────────────────────────

  private async request<T>(method: string, apiPath: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${apiPath}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API ${method} ${url} failed with ${response.status}: ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // ── Group helpers ──────────────────────────────────────────────────────────

  /** Lists all groups the test user belongs to. */
  async listGroups(): Promise<GroupSummary[]> {
    return this.request<GroupSummary[]>('GET', '/groups');
  }

  /** Creates a group and returns its summary. */
  async createGroup(payload: CreateGroupPayload): Promise<GroupSummary> {
    return this.request<GroupSummary>('POST', '/groups', payload);
  }

  /** Deletes a group by ID (owner-only). */
  async deleteGroup(groupId: string): Promise<void> {
    return this.request<void>('DELETE', `/groups/${groupId}`);
  }

  // ── Event helpers ──────────────────────────────────────────────────────────

  /** Lists events in a group. */
  async listEvents(groupId: string): Promise<EventSummary[]> {
    return this.request<EventSummary[]>('GET', `/groups/${groupId}/events`);
  }

  /** Creates an event in a group and returns its summary. */
  async createEvent(payload: CreateEventPayload): Promise<EventSummary> {
    const { groupId, ...body } = payload;
    return this.request<EventSummary>('POST', `/groups/${groupId}/events`, body);
  }

  /** Deletes an event by group and event ID. */
  async deleteEvent(groupId: string, eventId: string): Promise<void> {
    return this.request<void>('DELETE', `/groups/${groupId}/events/${eventId}`);
  }
}
