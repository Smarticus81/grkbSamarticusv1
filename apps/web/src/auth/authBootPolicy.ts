export type AuthBootMode = 'clerk' | 'dev-open' | 'fatal';

export function selectAuthBootMode(input: {
  clerkPublishableKey?: string;
  isProduction: boolean;
}): AuthBootMode {
  if (input.clerkPublishableKey?.trim()) return 'clerk';
  return input.isProduction ? 'fatal' : 'dev-open';
}
