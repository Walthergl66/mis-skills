# Release Safety

Load this when handling pipeline secrets, ordering migrations against traffic, choosing a rollout strategy, running smoke and health gates, or rolling back a release.

## Secrets

| Path | Scope | Mechanism | Use for |
| --- | --- | --- | --- |
| GitHub OIDC | This workflow run | `id-token: write`, short-lived STS tokens | Registry login, cluster access, secret reads |
| Environment secrets | One GitHub environment | Approval gate plus scoped secrets | A production deploy value a person must authorise |
| Repository secret | Whole repository | Encrypted at rest in GitHub | A non-cloud package registry token |
| Runtime injection | The running pod | A secret store mounted as a file or env var | Database passwords, third-party API keys |

```yaml
permissions:
  contents: read
  id-token: write

- name: Authenticate to the cloud
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::111122223333:role/gha-ledger-deploy
    aws-region: eu-west-1
```

| Rule | Reason |
| --- | --- |
| `permissions` at the top, narrowed per job | The default token scope is broader than any job needs |
| No long-lived cloud keys in repository secrets | They never expire and survive every secret rotation elsewhere |
| No secret in `ARG`, `--build-arg`, or `env` on the build job | Build args and build env are recorded in the image and the log |
| No secret in `application.yaml` | It ships in the jar and is visible to anyone with read access |
| Runtime injection with a startup validation | A missing secret must fail at startup, not at the first call |
| Separate environments with separate secrets | A staging credential must not open production |

```java
package com.acme.billing.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("acme.ledger")
public record LedgerProperties(@NotBlank String url, @NotBlank String apiKey) {}
```

A `@NotBlank` property that resolves to a missing environment variable fails the context at startup. That is the behaviour you want: a service that cannot reach a dependency should not accept traffic.

## Migrations against traffic

The order is fixed: migration first, then the code that uses it, then the contract in a later release.

| Release | Schema | Code | State |
| --- | --- | --- | --- |
| N | Expand: add the new column, nullable, or the new table | Does not know about it | Old and new code both work |
| N+1 | No change | Reads and writes the new shape, tolerates the old | Mixed fleet, both versions work |
| N+2 | Contract: drop the old column or rename | No reference remains | Only new code runs |

| Rule | Reason |
| --- | --- |
| Never let every replica run migrations at startup | A rolling deploy would have replicas migrating concurrently |
| Run migrations as an explicit pipeline step or a Kubernetes Job | One process, one clear log, one clear failure |
| Add columns nullable, or with a default | A non-null column without a default locks a large table |
| Add indexes concurrently where the engine requires it | A blocking index build is a self-inflicted outage |
| Never rename or drop in the same release that stops using it | A rollback would then read a column that no longer exists |
| Record the migration version in a metric | Confirming which schema a replica is on must not require a shell |

```yaml
- name: Run migrations
  run: |
    kubectl -n ledger create job ledger-migrate-${{ github.sha }} \
      --image=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ needs.build.outputs.digest }} \
      -- /app/app.jar \
          --spring.main.web-application-type=none \
          --spring.flyway.enabled=true \
          --spring.flyway.locations=classpath:db/migration
    kubectl -n ledger wait --for=condition=complete job/ledger-migrate-${{ github.sha }} --timeout=10m
```

Run the job before any pod of the new version is created, and fail the deployment when it does not complete.

## Rollout strategies

| Strategy | Mechanism | Rollback | Capacity cost | Risk profile |
| --- | --- | --- | --- | --- |
| Rolling | Replace pods in place, several at a time | `kubectl rollout undo` | None | A fraction of traffic sees each version during the rollout |
| Blue-green | Full second deployment, then a selector switch | Switch the selector back | Two full environments | Instant but expensive; a schema change still constrains the green version |
| Canary | Small replica or traffic share, then widen | Remove the canary | A small extra allocation | Evidence-based, slower to complete |

| Rule | Reason |
| --- | --- |
| Max surge and max unavailable are explicit | The default surge can evict a healthy pod to fit the new one |
| Readiness gates the next replacement | Otherwise a not-ready pod receives traffic |
| The readiness threshold is lower than one for a fast service | A single not-ready replica with a threshold of one removes the whole service |
| Termination grace exceeds the measured drain | Otherwise `SIGKILL` truncates in-flight work |
| A canary watches error ratio and p95, not CPU | A canary is a correctness experiment, not a load experiment |

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
minReadySeconds: 10
progressDeadlineSeconds: 600
terminationGracePeriodSeconds: 45
```

`minReadySeconds` is the quiet period before a new pod is considered available. Without it, a pod that passes its first probe is immediately sent real traffic while its caches are still cold.

## Smoke and health gates

```bash
set -euo pipefail
BASE="https://${SERVICE_HOST}"

# 1. The process is up and reports the expected revision.
test "$(curl -fsS "${BASE}/actuator/health/readiness" | jq -r .status)" = "UP"
test "$(curl -fsS "${BASE}/actuator/info" | jq -r '.release.version')" = "${EXPECTED_VERSION}"

# 2. A representative unauthenticated path.
curl -fsS "${BASE}/actuator/health" | jq -e '.status == "UP"' > /dev/null

# 3. A path that exercises the database and the application logic.
ORDER_ID=$(curl -fsS -X POST "${BASE}/api/orders" \
  -H 'Content-Type: application/json' \
  -d '{"sku":"SKU-1","quantity":1}' | jq -r .id)
curl -fsS "${BASE}/api/orders/${ORDER_ID}" | jq -e '.status == "CREATED"' > /dev/null

# 4. The connection pool is not saturated after the burst.
curl -fsS "${BASE}/actuator/metrics/hikaricp.connections.usage" | jq -e '.measurements[0].value < 0.9' > /dev/null
```

| Gate | Passes when | Why |
| --- | --- | --- |
| Readiness | `UP` | The orchestrator agrees it can serve |
| Revision check | The reported version equals the deployed digest | A cache or a wrong selector serving an old version is caught |
| Functional smoke | A real write and read succeed | A health check does not prove the code path works |
| Saturation | Pool usage is below the agreed ceiling | A passing smoke test on a saturated pool is luck |
| Error ratio | Within the burn-in budget | The only gate that catches a latency or error regression |
| Latency | p95 within budget of the previous revision | Catches a change that is up but slower |

A burn-in window before the comparison matters. Comparing at t plus 10 seconds compares the warm-up state, and every cold-start change reads as a regression.

## Rollback

```bash
# 1. Revert to the previously recorded digest. Never rebuild.
PREVIOUS_DIGEST="$(kubectl -n ledger get deployment ledger -o jsonpath='{.spec.template.spec.containers[0].image}' | cut -d@ -f2)"
echo "rolling back from ${CURRENT_DIGEST} to ${PREVIOUS_DIGEST}"
kubectl -n ledger set image deployment/ledger app="registry.example.com/ledger@${PREVIOUS_DIGEST}"
kubectl -n ledger rollout status deployment/ledger --timeout=5m

# 2. Confirm the reverted revision is serving.
curl -fsS "${BASE}/actuator/info" | jq -r '.release.version'
```

| Situation | Action |
| --- | --- |
| Code defect, schema unchanged | Roll back the digest |
| Code defect, additive schema change | Roll back; the old code ignores the new column |
| Destructive schema change already applied | Forward-fix only; a rollback will fail |
| Secret or credential leaked in the release | Roll back, then rotate before the next attempt |
| A dependency is the cause | Roll back only if the change made the service dependent on it |

**The irreversible-release rule:** if any step of a release cannot be undone, a plan to move forward must exist before the step runs. Destructive migrations, dropped columns, deleted buckets, and one-way feature toggles are all one-way doors. Design the release so the one-way door is the last step, and keep the previous version runnable until the burn-in window closes.

## After the rollout

1. Compare error ratio, p95 latency, and saturation against the previous revision over a full window.
2. Confirm the live revision matches the intended digest from the `info` endpoint, not from the deployment record.
3. Keep the previous digest reachable for the length of the error-budget window, not just the deploy.
4. Record the release in the change log with the digest, the migration version, and the rollback target.
5. Delete the previous digest only after the window closes, and only if the retention policy allows it.
