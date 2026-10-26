import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertPrivatePath } from './local-platform.mjs';
import { OperationalFailure } from './process.mjs';

export function deployedConfiguration() {
  try {
    const directory = resolve(
      process.env.EQUIPMENT_TEST_STATE ??
        process.env.EQUIPMENT_CI_STATE ??
        '.local/kubernetes',
    );
    assertPrivatePath(directory, 0o700);
    const statePath = resolve(directory, 'smoke-state.json');
    assertPrivatePath(statePath, 0o600);
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (
      process.env.EQUIPMENT_DEPLOYED_CI === 'true' &&
      state.context !== 'kind-equipment-ci'
    )
      throw new Error('context');
    const credentialsPath = resolve(
      directory,
      state.credentialsFile ?? 'credentials.json',
    );
    assertPrivatePath(credentialsPath, 0o600);
    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
    for (const key of [
      'alice',
      'bob',
      'manager',
      'dashboardApi',
      'dashboardOtlp',
    ]) {
      if (typeof credentials[key] !== 'string' || !credentials[key])
        throw new Error('credentials');
    }
    const options = {
      applicationOrigin: state.applicationOrigin,
      authority: state.authority,
      dashboardOrigin:
        process.env.EQUIPMENT_DASHBOARD_ORIGIN ?? state.dashboardOrigin,
      otlpOrigin: process.env.EQUIPMENT_OTLP_ORIGIN ?? state.otlpOrigin,
      credentials,
    };
    for (const key of [
      'applicationOrigin',
      'authority',
      'dashboardOrigin',
      'otlpOrigin',
    ]) {
      const url = new URL(options[key]);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error('endpoint');
    }
    return options;
  } catch {
    throw new OperationalFailure(
      'Deployed-test prerequisites are missing or invalid. Configure private state, seeded credentials, endpoints, certificate trust and diagnostic forwards before running tests; private values suppressed.',
    );
  }
}
