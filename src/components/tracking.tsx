'use client';

import { useEffect, useRef } from 'react';
import { recordAppOpenAction, trackClientEventAction } from '@/server/actions/misc-actions';

/** Fires a product event once when the component is actually shown in the browser. */
export function TrackEvent({ name, properties }: { name: string; properties?: Record<string, unknown> }) {
  const sent = useRef(false);
  const serialized = JSON.stringify(properties ?? {});
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackClientEventAction(name, JSON.parse(serialized)).catch(() => {});
  }, [name, serialized]);
  return null;
}

/** Records a visit for active-user / retention metrics (throttled on the server). */
export function ActivityPing() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    recordAppOpenAction().catch(() => {});
  }, []);
  return null;
}
