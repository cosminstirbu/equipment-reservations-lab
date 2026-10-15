Yes—drop `user_agent.original` and test the actual User-Agent path before final privacy approval.

The contract does **not** classify ordinary browser/OS version information as inherently sensitive, and no secret leak is confirmed here. It does require excluding secrets and unapproved personal data. This unnecessary attribute exports a caller-controlled raw header without contributing to the agreed workflow diagnostics.

A harmless User-Agent sentinel provides meaningful coverage of a header the SDK actually captures. An arbitrary `X-Telemetry-Probe` test establishes only that that particular header is absent.

This is a small completion of the existing telemetry privacy work, not an expansion to guarantee that every possible input can never contain sensitive text. Preserve method, bounded route, status, timing and correlation; remove the unnecessary raw User-Agent attribute alongside the other raw request attributes. Avoid claiming universal header sanitization.
