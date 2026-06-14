#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CRITICAL_KEYS = [
  'DATABASE_URL',
  'NEO4J_URI',
  'NEO4J_USER',
  'NEO4J_PASSWORD',
  'JWT_SECRET',
  'VITE_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SIGNING_SECRET',
  'ALLOWED_ORIGINS',
  'VITE_API_URL',
  'PSUR_SERVICE_URL',
];

const LLM_KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY'];
const SESSION_TIMEOUT_KEYS = [
  'VITE_SESSION_IDLE_TIMEOUT_MINUTES',
  'VITE_SESSION_AWAY_TIMEOUT_MINUTES',
  'VITE_SESSION_WARNING_SECONDS',
];
const WEAK_SECRETS = new Set(['change-me', 'change-me-in-production', 'change-me-in-local-dev-only']);

export function parseArgs(argv) {
  const args = new Set(argv);
  return {
    envPath: argv.find((arg) => arg.startsWith('--file='))?.slice('--file='.length) ?? '.env',
    production: args.has('--production'),
  };
}

export function parseEnvContent(content) {
  const occurrences = new Map();

  content.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;

    const [rawKey, ...rest] = trimmed.split('=');
    const key = rawKey.trim();
    const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
    const existing = occurrences.get(key) ?? [];
    existing.push({ line: index + 1, value });
    occurrences.set(key, existing);
  });

  return occurrences;
}

export function parseEnvFile(path) {
  return parseEnvContent(readFileSync(path, 'utf8'));
}

export function effectiveValue(occurrences, key) {
  const values = occurrences.get(key);
  return values?.[values.length - 1]?.value ?? '';
}

export function hasValue(value) {
  return value.trim().length > 0;
}

export function isLocal(value) {
  const lower = value.toLowerCase();
  return lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('0.0.0.0') ||
    lower.includes('::1');
}

export function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function allHttpsOrigins(value) {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .every((origin) => isHttpsUrl(origin) && !isLocal(origin));
}

export function isNeo4jTlsUri(value) {
  return /^(neo4j|bolt)\+(s|ssc):\/\//.test(value.trim());
}

export function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function shape(key, value) {
  if (!hasValue(value)) return 'EMPTY';
  if (isLocal(value)) return 'LOCAL';
  if (key.includes('SECRET') || key.includes('PASSWORD') || key.endsWith('KEY')) {
    if (value.startsWith('sk_live_')) return 'SECRET(sk_live_)';
    if (value.startsWith('sk_test_')) return 'SECRET(sk_test_)';
    return `SECRET(len=${value.length})`;
  }
  try {
    const first = value.split(',')[0];
    const url = new URL(first);
    return `${url.protocol}//${url.hostname.slice(0, 3)}***`;
  } catch {
    return `VALUE(len=${value.length})`;
  }
}

export function addIssue(issues, severity, message) {
  issues.push({ severity, message });
}

export function inspectDuplicates(occurrences, issues) {
  for (const [key, values] of occurrences.entries()) {
    if (values.length <= 1) continue;

    const effective = values[values.length - 1];
    const previousUsable = values.slice(0, -1).some(({ value }) => hasValue(value) && !isLocal(value));
    const shadowedByEmptyOrLocal = previousUsable && (!hasValue(effective.value) || isLocal(effective.value));
    const severity = shadowedByEmptyOrLocal && (CRITICAL_KEYS.includes(key) || LLM_KEYS.includes(key))
      ? 'error'
      : 'warning';
    const locations = values.map(({ line, value }) => `line ${line} ${shape(key, value)}`).join(', ');

    addIssue(
      issues,
      severity,
      `${key} is defined ${values.length} times; effective value is from line ${effective.line}. ${locations}`,
    );
  }
}

export function inspectRequiredValues(occurrences, issues, production) {
  for (const key of CRITICAL_KEYS) {
    const value = effectiveValue(occurrences, key);
    if (!hasValue(value)) {
      addIssue(issues, 'error', `${key} is empty or missing.`);
    }
  }

  if (!LLM_KEYS.some((key) => hasValue(effectiveValue(occurrences, key)))) {
    addIssue(issues, 'error', `At least one LLM provider key is required: ${LLM_KEYS.join(', ')}.`);
  }

  const jwtSecret = effectiveValue(occurrences, 'JWT_SECRET');
  if (hasValue(jwtSecret) && (jwtSecret.length < 32 || WEAK_SECRETS.has(jwtSecret))) {
    addIssue(issues, 'error', 'JWT_SECRET must be a non-default value at least 32 characters long.');
  }

  if (production) {
    for (const key of SESSION_TIMEOUT_KEYS) {
      const value = effectiveValue(occurrences, key);
      if (!hasValue(value)) {
        addIssue(issues, 'error', `${key} is empty or missing.`);
      } else if (positiveNumber(value) === null) {
        addIssue(issues, 'error', `${key} must be a positive number.`);
      }
    }

    const idleMinutes = positiveNumber(effectiveValue(occurrences, 'VITE_SESSION_IDLE_TIMEOUT_MINUTES'));
    const awayMinutes = positiveNumber(effectiveValue(occurrences, 'VITE_SESSION_AWAY_TIMEOUT_MINUTES'));
    const warningSeconds = positiveNumber(effectiveValue(occurrences, 'VITE_SESSION_WARNING_SECONDS'));
    if (idleMinutes !== null && warningSeconds !== null && warningSeconds >= idleMinutes * 60) {
      addIssue(issues, 'error', 'VITE_SESSION_WARNING_SECONDS must be shorter than VITE_SESSION_IDLE_TIMEOUT_MINUTES.');
    }
    if (awayMinutes !== null && warningSeconds !== null && warningSeconds >= awayMinutes * 60) {
      addIssue(issues, 'error', 'VITE_SESSION_WARNING_SECONDS must be shorter than VITE_SESSION_AWAY_TIMEOUT_MINUTES.');
    }

    const localOnlyKeys = ['DATABASE_URL', 'NEO4J_URI', 'VITE_API_URL', 'PSUR_SERVICE_URL'];
    for (const key of localOnlyKeys) {
      const value = effectiveValue(occurrences, key);
      if (hasValue(value) && isLocal(value)) {
        addIssue(issues, 'error', `${key} points at a local service; production needs a deployed service URL.`);
      }
    }

    const httpsOnlyKeys = ['VITE_API_URL', 'PSUR_SERVICE_URL'];
    for (const key of httpsOnlyKeys) {
      const value = effectiveValue(occurrences, key);
      if (hasValue(value) && !value.startsWith('https://')) {
        addIssue(issues, 'error', `${key} must use https:// in production.`);
      }
    }

    if (!allHttpsOrigins(effectiveValue(occurrences, 'ALLOWED_ORIGINS'))) {
      addIssue(issues, 'error', 'ALLOWED_ORIGINS must contain only HTTPS production origins.');
    }

    if (!isNeo4jTlsUri(effectiveValue(occurrences, 'NEO4J_URI'))) {
      addIssue(issues, 'error', 'NEO4J_URI must use a TLS scheme such as neo4j+s:// in production.');
    }

    if (!effectiveValue(occurrences, 'CLERK_SECRET_KEY').startsWith('sk_live_')) {
      addIssue(issues, 'error', 'CLERK_SECRET_KEY must be a production sk_live_ key.');
    }

    if (!effectiveValue(occurrences, 'VITE_CLERK_PUBLISHABLE_KEY').startsWith('pk_live_')) {
      addIssue(issues, 'error', 'VITE_CLERK_PUBLISHABLE_KEY must be a production pk_live_ key.');
    }

    if (effectiveValue(occurrences, 'AUTH_BYPASS_DEV') === 'true') {
      addIssue(issues, 'error', 'AUTH_BYPASS_DEV must be false or unset in production.');
    }
  }
}

export function analyzeEnvContent(content, options = {}) {
  const occurrences = parseEnvContent(content);
  const issues = [];

  inspectDuplicates(occurrences, issues);
  inspectRequiredValues(occurrences, issues, options.production ?? false);

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return { errors, warnings, issues };
}

export function analyzeEnvFile(path, options = {}) {
  return analyzeEnvContent(readFileSync(path, 'utf8'), options);
}

export function main(argv = process.argv.slice(2)) {
  const { envPath, production } = parseArgs(argv);
  const resolved = resolve(envPath);
  const { errors, warnings, issues } = analyzeEnvFile(resolved, { production });

  console.log(`Checked ${resolved}`);
  console.log(`Mode: ${production ? 'production' : 'development'}`);
  console.log(`Errors: ${errors.length}; Warnings: ${warnings.length}`);

  for (const issue of issues) {
    const prefix = issue.severity === 'error' ? 'ERROR' : 'WARN';
    console.log(`${prefix} ${issue.message}`);
  }

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
