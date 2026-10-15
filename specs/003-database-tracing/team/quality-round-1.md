**Q-001 closed** on snapshot `79a1bbac…`.

Failure logging now occurs within the active bootstrap activity. The subprocess regression asserts that success and failure logs carry the exported bootstrap trace/span IDs, while preserving exit codes and privacy checks.

Verified all 250 manifest entries; only the three expected files changed. Recorded evidence shows the intended red failure followed by 18/18 focused tests passing.

No new findings. Final quality verdict awaits current full checks and runtime evidence.
