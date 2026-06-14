import { describe, expect, it } from 'vitest';
import { selectAuthBootMode } from './authBootPolicy.js';

describe('selectAuthBootMode', () => {
  it('uses Clerk when a publishable key is configured', () => {
    expect(selectAuthBootMode({ clerkPublishableKey: 'pk_test_123', isProduction: false })).toBe('clerk');
    expect(selectAuthBootMode({ clerkPublishableKey: 'pk_live_123', isProduction: true })).toBe('clerk');
  });

  it('allows no-Clerk open access only outside production', () => {
    expect(selectAuthBootMode({ clerkPublishableKey: undefined, isProduction: false })).toBe('dev-open');
    expect(selectAuthBootMode({ clerkPublishableKey: '   ', isProduction: false })).toBe('dev-open');
  });

  it('fails closed in production without Clerk', () => {
    expect(selectAuthBootMode({ clerkPublishableKey: undefined, isProduction: true })).toBe('fatal');
    expect(selectAuthBootMode({ clerkPublishableKey: '', isProduction: true })).toBe('fatal');
  });
});
