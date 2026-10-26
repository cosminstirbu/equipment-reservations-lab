import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OperationalFailure, safeFailure } from './process.mjs';
import { assertPrivatePath } from './local-platform.mjs';
import {
  authenticateCodeFlow,
  capturePersistenceCheckpoint,
  verifyPersistenceCheckpoint,
  savePersistenceCheckpoint,
  runPersistenceCaptureScenario,
} from '../tests/DeployedApplication/scenarios.mjs';

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let phase = 'prerequisites';
  try {
    const args = process.argv.slice(2);
    const capture = args.includes('--capture-persistence');
    const verify = args.includes('--verify-persistence');
    if (capture === verify)
      throw new OperationalFailure('Choose exactly one persistence operation.');
    const index = args.indexOf('--state');
    const directory = resolve(
      index >= 0
        ? args[index + 1]
        : (process.env.EQUIPMENT_CI_STATE ?? '.local/kubernetes'),
    );
    assertPrivatePath(directory, 0o700);
    const statePath = join(directory, 'smoke-state.json');
    let state = {};
    if (existsSync(statePath)) {
      assertPrivatePath(statePath, 0o600);
      state = JSON.parse(readFileSync(statePath, 'utf8'));
    }
    if (args.includes('--ci') && state.context !== 'kind-equipment-ci')
      throw new OperationalFailure(
        'CI smoke requires its explicit disposable context.',
      );
    const path = resolve(
      directory,
      state.credentialsFile ?? 'credentials.json',
    );
    assertPrivatePath(path, 0o600);
    const credentials = JSON.parse(readFileSync(path, 'utf8'));
    const checkpointPath = join(directory, 'persistence-checkpoint.json');
    const applicationOrigin =
      state.applicationOrigin ?? 'https://app.equipment.test';
    const authority =
      state.authority ?? 'https://identity.equipment.test/realms/equipment';
    if (capture && existsSync(checkpointPath))
      throw new OperationalFailure(
        'Existing persistence checkpoint must be retained; choose a new private state directory for another capture.',
      );
    phase = verify ? 'persistence verification' : 'deployed HTTP smoke';
    if (verify) {
      assertPrivatePath(checkpointPath, 0o600);
      const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
      const token = await authenticateCodeFlow({
        applicationOrigin,
        authority,
        username: 'employee-a',
        password: credentials.alice,
      });
      await verifyPersistenceCheckpoint({
        applicationOrigin,
        token,
        checkpoint,
      });
      console.log(
        'Persisted reservation, identity and notification effects verified.',
      );
    } else {
      const result = await runPersistenceCaptureScenario({
        credentials,
        applicationOrigin,
        authority,
        dashboardOrigin:
          process.env.EQUIPMENT_DASHBOARD_ORIGIN ?? state.dashboardOrigin,
        otlpOrigin: process.env.EQUIPMENT_OTLP_ORIGIN ?? state.otlpOrigin,
      });
      if (capture) {
        const token = await authenticateCodeFlow({
          applicationOrigin,
          authority,
          username: 'employee-a',
          password: credentials.alice,
        });
        const checkpoint = await capturePersistenceCheckpoint({
          applicationOrigin,
          token,
          reservationId: result.reservationId,
        });
        savePersistenceCheckpoint(checkpointPath, checkpoint);
      }
      console.log('Deployed HTTP smoke passed.');
    }
  } catch (error) {
    console.error(
      `Smoke ${phase} failed. ${safeFailure(error, 'Private operation failed; credentials, transport details and HTTP bodies are suppressed.')}`,
    );
    process.exitCode = 1;
  }
}
