# Pipeline Design

Load this when writing or restructuring the GitHub Actions workflow for a Spring Boot 3.5 service, including build caching, the test split, image build and publish, and scan and sign stages.

## Job graph

```text
verify ──────────────┐
  unit tests         │
  static analysis    ├──> build ──> scan ──> sign ──> publish
                     │      (digest)                        │
verify-integration ──┘                                       │
  Testcontainers                                             │
  migrations                                                 │
  end to end                                                 v
                                                     deploy ──> verify-deployment
```

Each job is a gate. A later job never runs to compensate for an earlier one that failed; a red fast stage is a feature, not a bottleneck.

## The workflow

```yaml
name: release

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      - name: Cache Maven repository
        uses: actions/cache@v4
        with:
          path: ~/.m2/repository
          key: m2-${{ runner.os }}-${{ hashFiles('**/pom.xml') }}
          restore-keys: |
            m2-${{ runner.os }}-

      - name: Verify
        run: ./mvnw -B -ntp -Dstyle.color=always verify

      - name: Upload test reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: unit-test-reports
          path: target/surefire-reports
          retention-days: 7

  verify-integration:
    runs-on: ubuntu-latest
    needs: verify
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: ledger_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      - name: Cache Maven repository
        uses: actions/cache@v4
        with:
          path: ~/.m2/repository
          key: m2-${{ runner.os }}-${{ hashFiles('**/pom.xml') }}
          restore-keys: |
            m2-${{ runner.os }}-

      - name: Integration tests
        run: ./mvnw -B -ntp -Dstyle.color=always verify

      - name: Upload test reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: integration-test-reports
          path: target/failsafe-reports
          retention-days: 7

  build:
    runs-on: ubuntu-latest
    needs: [verify, verify-integration]
    permissions:
      contents: read
      id-token: write
    outputs:
      digest: ${{ steps.meta.outputs.digest }}
      tags: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: docker/setup-buildx-action@v3

      - name: Compute image metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,format=long
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        id: push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: mode=max

      - name: Export digest
        run: echo "digest=${{ steps.push.outputs.digest }}" >> "$GITHUB_OUTPUT"

  scan:
    runs-on: ubuntu-latest
    needs: build
    permissions:
      contents: read
      packages: read
    steps:
      - uses: actions/checkout@v4

      - name: Trivy image scan
        uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ needs.build.outputs.digest }}
          severity: CRITICAL,HIGH
          ignore-unfixed: true
          exit-code: '1'

      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          image: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ needs.build.outputs.digest }}
          format: cyclonedx-json
          output-file: sbom.json

      - uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: sbom.json
          retention-days: 30

  sign:
    runs-on: ubuntu-latest
    needs: build
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: sigstore/cosign-installer@v3
      - name: Sign the digest
        run: |
          cosign sign --yes \
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ needs.build.outputs.digest }}
```

| Job | Gate | Fails when |
| --- | --- | --- |
| `verify` | Code compiles, style is clean, unit and slice tests pass | A fast signal, before any container starts |
| `verify-integration` | Testcontainers tests, migrations, and end-to-end paths pass | A real dependency disagrees with the code |
| `build` | A package and an image digest exist | A reproducible build failure |
| `scan` | No fixable CRITICAL, and an SBOM is attached | A vulnerable base image or a shipped secret |
| `sign` | A keyless signature verifies against the digest | An untrusted provenance chain |
| `publish` | The digest is addressable and immutable | A registry or permission failure |

## Cache rules

| Aspect | Rule | Consequence of getting it wrong |
| --- | --- | --- |
| Cache path | `~/.m2/repository` | Caching `target/` ships stale classes |
| Key | `hashFiles('**/pom.xml')` | A branch-only key ships yesterday's dependencies |
| Restore | `restore-keys` with a prefix | Full re-download on every run |
| Wrapper | Commit `.mvn/wrapper/maven-wrapper.properties` | The pipeline uses a different Maven than the developer |
| Flags | `-B -ntp` | Interactive progress output in a non-interactive log |
| Report upload | `if: always()` | A failure produces no report, which is when the report matters most |

## Test split and determinism

```xml
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-surefire-plugin</artifactId>
  <configuration>
    <includes>
      <include>**/*Test.java</include>
    </includes>
    <excludes>
      <exclude>**/*IT.java</exclude>
    </excludes>
    <forkCount>2</forkCount>
    <reuseForks>true</reuseForks>
    <runOrder>random</runOrder>
    <systemPropertyVariables>
      <junit.jupiter.execution.parallel.enabled>true</junit.jupiter.execution.parallel.enabled>
      <junit.jupiter.execution.parallel.mode.default>same_thread</junit.jupiter.execution.parallel.mode.default>
      <junit.jupiter.execution.parallel.mode.classes.default>concurrent</junit.jupiter.execution.parallel.mode.classes.default>
    </systemPropertyVariables>
  </configuration>
</plugin>
```

| Rule | Reason |
| --- | --- |
| Parallelise at the class level, not the method level | A method-level parallel default breaks `@Transactional` rollback and shared fixtures |
| `reuseForks=true` with `forkCount=2` | JVM startup dominates when forks are not reused |
| `runOrder=random` | It surfaces order dependence, and the report records the seed |
| Never share a database between parallel classes | Contention turns a fast suite into a flaky one |
| Truncate or disable the Testcontainers Ryuk check only in CI | A leaked container then survives the run |
| Publish JUnit XML always | The CI report is the artifact that survives the log scrollback |

## Promotion

```yaml
  deploy-staging:
    runs-on: ubuntu-latest
    needs: sign
    environment: staging
    permissions:
      contents: read
      packages: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - name: Deploy by digest
        run: |
          helm upgrade --install ledger ./charts/ledger \
            --set image.digest=${{ needs.build.outputs.digest }} \
            --wait --timeout 5m

  deploy-production:
    runs-on: ubuntu-latest
    needs: deploy-staging
    environment: production
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - name: Deploy the same digest
        run: |
          helm upgrade --install ledger ./charts/ledger \
            --set image.digest=${{ needs.build.outputs.digest }} \
            --wait --timeout 10m
```

`image.digest`, never `image.tag`. A tag is a mutable pointer; re-running the deployment job with the same digest is idempotent, and re-running it with the same tag is not.

## A minimal local reproduction of the pipeline

```bash
# Same commands, same wrapper, same flags, before pushing.
./mvnw -B -ntp verify
docker buildx build --tag registry.example.com/ledger:local --load .
docker run --rm -m 768m -p 9090:9090 -p 8080:8080 registry.example.com/ledger:local
trivy image --severity CRITICAL,HIGH --exit-code 1 registry.example.com/ledger:local
```

The local command and the pipeline command must be the same string. When they diverge, the pipeline is the only place the build is ever proven, and a broken pipeline is discovered at the worst moment.
