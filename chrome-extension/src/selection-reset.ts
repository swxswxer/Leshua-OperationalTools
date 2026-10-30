import type { ReportType } from './api/quick-report';

export const TAKE_SELECTION_RESET = 'operations:take-selection-reset';
export const SELECTION_RESET_TTL_MS = 60_000;

export interface SelectionResetCommand {
  id: string;
  windowId: number;
  selectionText: string;
  businessLine: 'syt' | 'lhsd';
  reportType: ReportType;
  createdAt: number;
}

export type SelectionResetResponse =
  | { ok: true; command: SelectionResetCommand | null }
  | { ok: false; error: string };

export function selectionResetStorageKey(windowId: number): string {
  return `operations:selection-reset:${windowId}`;
}
