**PASS — bounded native-diagnostics security review. No new confirmed finding.**

Matched all six frozen SHA256 hashes:

| File | SHA256 |
|---|---|
| azure-native-fixture.mjs | `47A4673B78BD681B2070BCF48C854835633C52A1A3E9A1F9830E7F5B5869AD21` |
| azure-native-fixture.test.mjs | `1319AA59C51C027DDA8935A18F2483DE061EBB5E85C3F1572E4363EF00FEEEF5` |
| azure-acme.test.mjs | `D447E82A65556C7BE6C26E275F791B26724364E5573BBD101595F7CD57FA7F1D` |
| azure-admission.test.mjs | `BD1091D084FA9A709B41CD91205BF20C7F4AB9986648AF53814D1AB543A020D8` |
| azure-recovery-bundle.native.test.mjs | `A52BE67990209FFFD62B36C5ECA9BCD3DA41FB6721C3E5D525CA2349B552ABD0` |
| azure-observability.test.mjs | `13CB976BA0CBC21433F6553FFA9B03071CD040CBC34A55241DB89797294DF942` |

The helper reconstructs bounded process metadata with allowlisted phase/tool labels. It excludes arbitrary messages, captured output, arguments, URLs, environment, input and causes. Primary failure precedence is preserved while cleanup attempts continue and secondary failures remain separately diagnosable.

Fixture cleanup remains scoped to owned resources/private directories; bundle cluster deletion now supplies its explicit private kubeconfig. No assertion, timeout, parallelism or readiness weakening was identified.

Independently ran `node --test scripts/azure-native-fixture.test.mjs`: **5 passed, zero failures/skips**, exit 0. Real subprocess cases cover primary exit 11, cleanup exit 17, later cleanup execution and private-output suppression.

This approves diagnostic handling only. No provider fixtures were rerun; original native failures, root cause and combined-gate closure remain unresolved. The separately recorded HTTPS body deadline/abort risk is unchanged.

No files changed or cloud actions performed. No full-feature approval.
