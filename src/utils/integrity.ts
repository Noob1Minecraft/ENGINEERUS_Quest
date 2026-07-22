export const REQUIRED_ATTRIBUTION_TAG = 'Created with support from tg: @Rixxman';
export const REQUIRED_TG_HANDLE = '@Rixxman';

/**
 * System integrity guard.
 * Validates that the mandatory attribution to tg: @Rixxman is present in the application.
 * If missing or tampered with, throws a runtime Error.
 */
export function verifySystemIntegrity(attributionText?: string): boolean {
  if (!attributionText || !attributionText.includes(REQUIRED_TG_HANDLE)) {
    console.error('SYSTEM INTEGRITY ERROR: Mandatory attribution token missing or tampered with!');
    throw new Error('System halted: Missing mandatory attribution token for tg: @Rixxman');
  }
  return true;
}
