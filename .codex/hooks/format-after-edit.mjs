import { format, sourcePath } from '../../scripts/quality.mjs';
import { resolve } from 'node:path';

export function editedPaths(event) {
  const input = event.tool_input;
  if (input && typeof input === 'object' && typeof input.file_path === 'string')
    return [input.file_path];
  const patch =
    typeof input === 'string'
      ? input
      : (input?.input ?? input?.patch ?? input?.command);
  if (typeof patch !== 'string')
    throw new Error(
      'Unrecognized edit payload; run npm run format -- <edited files> before continuing.',
    );
  const paths = [];
  for (const line of patch.split('\n')) {
    const match = /^\*\*\* (?:Add File|Update File|Move to): (.+)$/.exec(line);
    if (match) paths.push(match[1]);
  }
  if (!patch.includes('*** Begin Patch') && paths.length === 0)
    throw new Error(
      'Cannot identify edited files; run the formatter explicitly.',
    );
  return paths;
}

if (process.argv[1]?.endsWith('format-after-edit.mjs')) {
  try {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const event = JSON.parse(input);
    if (event.permission_mode === 'plan') process.exit(0);
    const paths = editedPaths(event)
      .map((path) => resolve(event.cwd, path))
      .filter((path) => sourcePath(path));
    await format(paths, false, true);
    if (paths.length)
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext:
              'Edited source files formatted. Re-read them before further edits; semantic IDE/ESLint diagnostics still require npm run lint.',
          },
        }),
      );
  } catch (error) {
    console.error(`Post-edit formatting failed: ${error.message}`);
    process.exitCode = 2;
  }
}
