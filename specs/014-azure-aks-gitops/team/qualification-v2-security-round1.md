**Dashboard callback delta: PASS, bounded source review.**

Matched `operators.tf` SHA256 `F634D43BD33B5ADAEFAD2FB603467CA40D167710A25F16D74B44E288D9ABAAA6` and test SHA256 `B40DACC2399B11102E29048F0BC29943B2B2AF7DEBE3E3D0BDCCD2BCA3CCBA28`. Dashboard now registers its exact HTTPS root; Argo retains `/auth/callback`. Confidential flow, tenant restriction and required operator assignment remain intact. Native challenge and RED/GREEN results are coordinator-supplied evidence, not independently rerun.

**Qualification v2 proposal: PASS for preparation.**

Matched proposal SHA256 `9450E68D778E931FB82DF1AC1F1C9CF093536C1E53BC4C9A7697FB5CE4563141`.

The proposal separates infrastructure anchor, reviewed source and actual executed checkout; rejects v1 rather than reinterpreting it; requires actual clean Git HEAD and trusted workflow SHA agreement; binds the explicit dependency manifest against both Git revisions; and accepts later application commits only with identical reviewed closure bytes. Current activation, principal, cluster CA, generation, nonce, expiry and consumption checks remain required.

Implementation review must establish the complete behavior-affecting dependency closure and enforce these checks at public producer/consumer boundaries. Actual hosted identity qualification remains pending.

**SEC-GO002 correction: RETRACTED; no repair required.**

The actual SQL Job is explicitly in `equipment`, uses existing `database-bootstrap`, and receives its matching SPC there. The verification admission and backup Job-create grant apply only to `equipment-recovery`. Therefore the trusted SQL path is outside the verification restriction. Database Job SHA256: `AA0074D89D028D9F3E8CFCDE252EA6A6622438D56B1DF1F711E56248C60091DE`.

My original finding incorrectly inferred its namespace. Preserve this correction alongside the original report. SEC-GO001 and SEC-GO003 remain unchanged.

No files changed or live actions performed.
