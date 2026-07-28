import type { CodePlateValues, LegacyApi, LogHandler, StatusHandler } from '../content/contracts';

export async function transferCodePlates(
  api: LegacyApi,
  values: CodePlateValues,
  log: LogHandler,
  onStatus: StatusHandler,
): Promise<void> {
  await api.transferCodePlates(values, { onLog: log, onStatus });
}
