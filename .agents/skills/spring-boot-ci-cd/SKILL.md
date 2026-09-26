---
name: spring-boot-ci-cd
description: 'Use when designing, repairing, or reviewing the delivery pipeline for a Spring Boot 3.5 service. Triggers include GitHub Actions workflow, Maven wrapper, ~/.m2 cache key, surefire and failsafe split, testcontainers stage, docker build-push-action, image scan, SBOM, cosign, secrets handling, OIDC, environment promotion, rolling or blue-green or canary deploy, smoke test, health gate, and rollback. Do not use for Dockerfile and image internals, nor for runtime property configuration. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Boot Delivery Pipeline

Own the path from a commit to a running revision: stage order, cache correctness, quality gates, secret handling, image publication, promotion, verification, and rollback. The pipeline is where the immutability of an artifact is established, so a shortcut here is a production incident with a long lead time.

## When to use

- Writing or restructuring the GitHub Actions workflow for a Boot service.
- Builds are slow, or the Maven cache misses on every run.
- Integration tests run in the wrong stage, or nowhere in the pipeline.
- Secrets are needed in a build and there is no safe path for them.
- Deciding between rolling, blue-green, and canary deployment.
- Adding a scan gate, SBOM generation, or image signing.
- A deploy succeeded and the service is broken, and there is no quick rollback.

## When not to use

- Dockerfile content, base images, and image hygiene belong to `spring-boot-docker`.
- Which tests run and how slices and Testcontainers are configured belong to `spring-boot-integration-testing`.
- Binding production properties and secrets at runtime belongs to `spring-boot-core`.
- Migration scripts and their correctness belong to `spring-boot-flyway`.
- The health endpoint the rollout gate polls belongs to `spring-boot-actuator`.
- SLO and alert verification belong to `spring-boot-observability`.

## Ownership and sibling boundaries

This skill owns the pipeline and the release decision.

- `spring-boot-docker` owns the image itself. Hand it the build command and take back the digest it produces.
- `spring-boot-integration-testing` owns the test classes. Hand it a stage boundary and a service dependency set.
- `spring-boot-core` owns runtime configuration. Hand it the environment variable contract each environment supplies.
- `spring-boot-flyway` owns migrations. Hand it an explicit pipeline step that must complete before traffic moves.
- `spring-boot-actuator` owns the health and probe contract. Hand it the readiness URL the deploy gate waits on.
- `spring-boot-observability` owns the signals. Hand it the deploy marker it must emit.

## Hard rules

1. **Build once, promote the same digest.** Rebuilding per environment means the artifact you tested is not the artifact you ship.
2. **A secret never enters a build argument, a layer, or a committed file.** Use OIDC federation for CI-to-cloud and runtime injection for application secrets.
3. **The cache key must include the build definition.** Caching `~/.m2` on the branch name alone ships yesterday's dependencies with today's source.
4. **Migrations run as an explicit step before the new version receives traffic,** and never from every replica at startup.
5. **Old and new versions must coexist for the length of a rollout.** Any schema or event change must be backward compatible across two versions.
6. **A deploy is not complete until a smoke test and a health gate pass** against the deployed revision, not against the build environment.
7. **Rollback must be possible, and forward-fix must always be possible.** A destructive migration can make rollback impossible, so plan the release so it is never needed.
8. **A green pipeline is evidence for its tested scope,** not proof of production safety.

## Stage order

| Stage | Runs | Gate to pass | Why the order matters |
| --- | --- | --- | --- |
| `verify` | Format check, compile, unit tests | Zero failures, no checkstyle or format drift | Fastest possible rejection of a broken commit |
| `verify-integration` | Testcontainers tests, migrations against a real database | All green | Expensive and flaky-adjacent; run only after the fast gate |
| `build` | Package, layer extraction, image build | Artifact and image digest produced | Nothing downstream can exist without it |
| `scan` | Image vulnerability, SBOM, secret, licence | No fixable CRITICAL, SBOM attached | A blocked release after a build wastes the whole pipeline |
| `sign` | Provenance and signature with a keyless identity | Signature verifies against the digest | Publishing an unsigned image is not a release |
| `publish` | Registry push by digest | Digest is immutable and addressable | Promotion moves a reference, never a build |
| `deploy` | Rollout, smoke test, health gate | Smoke and health pass, metrics stable | A rollout is not done when the command returns |
| `verify-deployment` | Error ratio and latency against the baseline | No regression beyond the agreed budget | Catches the failures a health endpoint cannot see |

## Test split

| Test kind | Maven plugin | Phase | Needs infrastructure | Stage |
| --- | --- | --- | --- | --- |
| Unit | `surefire` | `test` | No | `verify` |
| Slice | `surefire` | `test` | No, mocked | `verify` |
| Integration | `failsafe` | `integration-test`, `verify` | Testcontainers | `verify-integration` |
| End to end | `failsafe` | `integration-test`, `verify` | A running application and its dependencies | `verify-integration` |
| Contract | `failsafe` | `integration-test`, `verify` | A provider stub or a shared environment | `verify-integration` |

```xml
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-failsafe-plugin</artifactId>
  <configuration>
    <includes>
      <include>**/*IT.java</include>
    </includes>
  </configuration>
  <executions>
    <execution>
      <goals>
        <goal>integration-test</goal>
        <goal>verify</goal>
      </goals>
    </execution>
  </executions>
</plugin>
```

`mvn verify` runs both plugins, so a pipeline that only calls `package` silently skips every integration test. Name the two phases explicitly when the stages must be separable.

## Caching that is correct

```yaml
- name: Cache Maven repository
  uses: actions/cache@v4
  with:
    path: ~/.m2/repository
    key: m2-${{ runner.os }}-${{ hashFiles('**/pom.xml') }}
    restore-keys: |
      m2-${{ runner.os }}-
      m2-${{ runner.os }}-${{ hashFiles('**/pom.xml') }}
```

| Rule | Reason |
| --- | --- |
| Key on `hashFiles('**/pom.xml')` | Any dependency change, including a transitive one, produces a new key |
| `restore-keys` prefix for a warm start | Restores the previous cache and re-downloads only what is missing |
| Use `./mvnw -B -ntp` | Batch mode, no transfer progress spam, and the wrapper pins the Maven version |
| Commit `.mvn/wrapper/maven-wrapper.properties` | The pipeline must build with the same Maven the developer uses |
| Do not cache `target/` | A stale compiled output produces a build that is not what the source says |

`actions/setup-java` with `cache: maven` is simpler and keys on the same files. Use one mechanism, not two, or the two caches fight.

## Secrets

| Path | Use for | Never |
| --- | --- | --- |
| GitHub OIDC to the cloud provider | Registry login, cluster access, secret read | Long-lived cloud keys in repository secrets |
| GitHub Actions secrets for non-cloud logins | A package registry token scoped to one repository | Passing them as `--build-arg` or `ARG` in a Dockerfile |
| Runtime secret injection | Database passwords, API keys | Baking them into `application.yaml` or an env var on the build job |
| `GITHUB_TOKEN` | Repository contents, packages within the same repository | Anything outside the repository |

A build argument is recorded in the image history. An `ARG` in a Dockerfile is also recorded. Inject at runtime and let the application read it as a property.

## Deployment strategies

| Strategy | Rollback speed | Database compatibility | Cost | Choose when |
| --- | --- | --- | --- | --- |
| Rolling | Minutes, and partial traffic throughout | Two versions coexist, so expand-and-contract is mandatory | None extra | Default for a stateless service with backward-compatible changes |
| Blue-green | Seconds, switch the selector back | Two versions coexist during the switch | Double capacity briefly | A change with a high risk that must be reversible instantly |
| Canary | Minutes, small percentage first | Two versions coexist | Extra capacity for the canary | A change where you want error and latency evidence before full exposure |

The compatibility rule is the same for all three: for the duration of the rollout, version N and version N-1 both run against the same schema and exchange the same events. Expand a schema, deploy code that tolerates both shapes, then contract in a later release.

## Deploy verification and rollback

```yaml
- name: Wait for readiness
  run: |
    for attempt in $(seq 1 30); do
      if [ "$(kubectl get pod "$POD" -o jsonpath='{.status.containerStatuses[0].ready}')" = "true" ]; then
        echo "ready after ${attempt} polls"; exit 0
      fi
      sleep 5
    done
    echo "pod never became ready"; exit 1
```

1. **Smoke test** a real user path: a health check, a representative authenticated call, and one that touches the database.
2. **Health gate**: wait for readiness, then compare the error ratio and p95 latency against the previous revision over a burn-in window.
3. **Rollback** by moving the previous digest back, never by rebuilding.
4. **Forward-fix** is the only option after a destructive migration, so keep the window between migration and code change reversible.

## Reference routing

| Task | Load |
| --- | --- |
| Write the GitHub Actions workflow with caching, a test split, image build, publish, scan, and sign | [pipeline-design.md](references/pipeline-design.md) |
| Handle secrets, order migrations against traffic, choose a rollout strategy, run smoke and health gates, and roll back | [release-safety.md](references/release-safety.md) |

## Expected response

- **Stage map:** the ordered stages with the gate each one enforces and the split between unit and integration execution.
- **Workflow YAML:** a complete job graph with the Maven wrapper, a correct `~/.m2` cache key, and a non-interactive Maven invocation.
- **Artifact identity:** the digest that is built once and promoted, with the tag treated as a mutable pointer.
- **Secret plan:** what is fetched through OIDC, what is injected at runtime, and confirmation that nothing reaches a build arg or a layer.
- **Migration and rollout plan:** the ordering against traffic, the compatibility rule for two coexisting versions, and the strategy chosen with its cost.
- **Verification and rollback:** the smoke path, the health gate, the rollback command, and the forward-fix escape route.
