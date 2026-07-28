import type { LegacyApi, LogHandler, StatusHandler, WhitelistValues } from '../content/contracts';

export async function addChangeWhitelist(
  api: LegacyApi,
  values: WhitelistValues,
  log: LogHandler,
  onStatus: StatusHandler,
): Promise<void> {
  await api.addMerchantChangeWhitelist(values, { onLog: log, onStatus });
}
