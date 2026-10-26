import { test } from 'node:test';
import {
  verifyDeploymentSurface,
  verifyDeployedIdentity,
  verifyDeployedAuthorization,
  verifyDeployedLifecycle,
  verifyDeployedDiagnostics,
  verifyDeployedTelemetryScenario,
} from './scenarios.mjs';
import { deployedConfiguration } from '../../scripts/deployed-test-config.mjs';
import { safeFailure } from '../../scripts/process.mjs';

function scenario(probe) {
  return async () => {
    let failure;
    try {
      await probe(deployedConfiguration());
      return;
    } catch (error) {
      failure = safeFailure(
        error,
        'Deployed scenario failed; private diagnostics suppressed.',
      );
    }
    throw new Error(failure);
  };
}

// Serial by default: scenarios share seeded identities and the read-only equipment catalog.
test(
  'Public application and documentation surface',
  { timeout: 180000 },
  scenario(verifyDeploymentSurface),
);
test(
  'Seeded identities and documentation authentication',
  { timeout: 180000 },
  scenario(verifyDeployedIdentity),
);
test(
  'Reservation role and origin authorization',
  { timeout: 180000 },
  scenario(verifyDeployedAuthorization),
);
test(
  'Reservation ownership cancellation and notifications',
  { timeout: 180000 },
  scenario(verifyDeployedLifecycle),
);
test(
  'Dashboard and telemetry authentication',
  { timeout: 180000 },
  scenario(verifyDeployedDiagnostics),
);
test(
  'Correlated reservation telemetry and privacy',
  { timeout: 180000 },
  scenario(verifyDeployedTelemetryScenario),
);
