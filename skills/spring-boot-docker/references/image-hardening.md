# Image Hardening

Load this when choosing a base image, deciding between a Dockerfile and buildpacks, evaluating GraalVM native image, or wiring SBOM generation, signing, and vulnerability scan gates into image delivery.

## Base image choice

| Base | Size | Contains a shell | CVE churn | Choose when |
| --- | --- | --- | --- | --- |
| `eclipse-temurin:21-jre` | ~230 MB | Yes | Low, single upstream | Default runtime for a layered jar service |
| `eclipse-temurin:21-jre-jammy` | ~230 MB | Yes | Low, OS-tagged | You want the base OS major version pinned alongside the JDK |
| `eclipse-temurin:21-jre-alpine` | ~90 MB | Yes, limited | Higher, musl differences | Disk or pull time is the binding constraint, and you accept musl risk |
| `gcr.io/distroless/java21-debian12` | ~180 MB | No | Low | You never shell in and want the smallest supported JVM base |
| `gcr.io/distroless/java21-debian12:debug` | ~280 MB | No, with a debug variant | Low | You need a non-root debug path for production incidents |
| `scratch` or `busybox` | ~5 MB | No | Very low | Native image only, never a JVM service |
| `paketobuildpacks/run:base-jammy-tiny` | ~40 MB plus the app | No, by default | Low | The buildpack build-image path |

| Rule | Reason |
| --- | --- |
| Pin by digest, not by tag | `21-jre` is a moving target; a tag is not a version |
| Match `java -version` to the build JDK | A runtime older than the class-file target fails at class load |
| Prefer one upstream over a curated composite | Curated images hide what changed between releases |
| Refresh on a schedule, not on every build | Emergency base bumps break services that were fine yesterday |
| Record the digest in the SBOM | Attestation without a digest is unattributable |

```bash
docker buildx imagetools inspect eclipse-temurin:21-jre --format '{{json .Manifest.Digest}}'
docker pull eclipse-temurin@sha256:0000000000000000000000000000000000000000000000000000000000000000
```

A digest-pinned `FROM` makes the build reproducible and turns a compromised tag into a build failure instead of a silent supply-chain change.

## Buildpacks versus a hand-written Dockerfile

| Dimension | Dockerfile | Buildpacks (`spring-boot:build-image`) |
| --- | --- | --- |
| Buildpack and builder version | Yours to pin | Pinned by the builder image tag |
| Layered jar and jlink | You write the extraction step | Handled by the Spring Boot buildpack |
| CVE surface | Whatever your base and layers expose | Smaller runtime base by default |
| Debug image | You build a second target | `BPF_DEBUG_IMAGE` and `-debug` metadata |
| Timeouts and process model | Yours | Sane defaults, less room for a wrong PID 1 |
| Customisation | Total control | Buildpack environment variables only |
| Build time | Faster, no pack fetch | Slower, first build pulls the builder |
| Local and CI parity | Two definitions to keep in sync | One command, same result everywhere |
| Failure diagnosis | Full control over every step | You read buildpack logs |

```bash
./mvnw -B -ntp spring-boot:build-image \
  -Dspring-boot.build-image.imageName=registry.example.com/ledger:1.4.2 \
  -Dspring-boot.build-image.builder=paketobuildpacks/builder-jammy-base:latest \
  -Dspring-boot.build-image.runImage=eclipse-temurin:21-jre-jammy \
  -Dspring-boot.build-image.publish=false
```

Adopt buildpacks when you have no specific reason to own layer extraction. Keep a Dockerfile when you need a stage the pack does not model, such as a sidecar, a code-generation step, or an architecture-specific binary.

## GraalVM native image

```xml
<profiles>
  <profile>
    <id>native</id>
    <build>
      <plugins>
        <plugin>
          <groupId>org.graalvm.buildtools</groupId>
          <artifactId>native-maven-plugin</artifactId>
          <configuration>
            <buildArgs>
              <buildArg>--no-fallback</buildArg>
            </buildArgs>
          </configuration>
        </plugin>
      </plugins>
    </build>
  </profile>
</profiles>
```

```bash
./mvnw -B -ntp -Pnative native:compile -DskipTests
```

| Dimension | JVM | Native image |
| --- | --- | --- |
| Startup | Seconds | Tens of milliseconds |
| Resident memory | Higher, metaspace plus code cache | Substantially lower |
| Peak throughput | Equal or higher at steady state | Equal or higher at steady state |
| Build time | Tens of seconds | Minutes, and minutes again on a cache miss |
| Reflection, dynamic proxies, resource loading | Work | Require reachability metadata or explicit registration |
| Debuggability | Full | Stack traces need source metadata, so build with debug info |
| Bytecode agent tooling | Available | Unavailable |

| Rule | Reason |
| --- | --- |
| Always pass `--no-fallback` | A fallback image silently reintroduces the JVM and hides the failure |
| Generate an SBOM for the native build | Native binaries have no manifest to inspect |
| Benchmark before and after | Startup gain is real; steady-state gain is not guaranteed |
| Treat every `Class.forName`, `ServiceLoader`, and `MethodHandle` site as a break | Native image performs closed-world analysis at build time |
| Record reflection hints as a test | A missing hint shows up as a runtime `ClassNotFoundException`, not a build error |

Native image is for scale-from-zero, serverless functions, CLIs, and tight memory limits. It is not a general performance upgrade for a service that already has warm replicas.

## JVM flags as a hardening surface

| Flag | Effect | Risk |
| --- | --- | --- |
| `-XX:MaxRAMPercentage=75.0` | Heap derived from the cgroup limit | Above roughly 80 percent, native memory and heap fight for the same limit |
| `-XX:MaxMetaspaceSize=256m` | Bounds unbounded class-loading growth | Unset means an unbounded ceiling and a slow OOM |
| `-XX:+ExitOnOutOfMemoryError` | OOM becomes a non-zero exit | Requires a restart policy, otherwise a crash is a permanent outage |
| `-XX:+UseSerialGC` | Minimal footprint for tiny heaps | Collapses under concurrency |
| `-XX:+UseParallelGC` | Throughput, low overhead | Not a low-pause-time collector |
| `-Djava.security.egd=file:/dev/./urandom` | Avoids entropy blocking on some JVM and base combinations | Rarely needed on a modern Linux base |
| `-XX:StartFlightRecording` | Continuous profiling | Writes a file per process; ship it deliberately or not at all |

## SBOM, signing, and provenance

```bash
# CycloneDX or SPDX SBOM from the built image.
syft registry.example.com/ledger:1.4.2 -o cyclonedx-json=sbom.json

# Sign with a keyless OIDC identity bound to the workflow.
cosign sign --yes registry.example.com/ledger@sha256:<digest>

# Verify at deploy time before starting the container.
cosign verify --certificate-identity-regexp \
  'https://github.com/acme/ledger/.github/workflows/release.yml' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  registry.example.com/ledger@sha256:<digest>
```

| Artifact | Producer | Consumer |
| --- | --- | --- |
| SBOM | `anchore/sbom-action` or `syft` at build time | Vulnerability scanner, license audit, incident response |
| SLSA provenance | GitHub Actions `id-token: write` plus `cosign attest` | Deployment policy, audit |
| Signature | `cosign sign` with keyless OIDC | Admission controller, deploy step |
| Digest record | Build job output | Environment promotion, rollback target |

## Scan gates

| Gate | Tool | Blocking condition |
| --- | --- | --- |
| Image vulnerability | Trivy or Grype | Any CRITICAL with a fix available |
| Base image age | Registry API or a scheduled check | Base digest older than the refresh window |
| Secret in layers | Gitleaks or a history scan | Any finding in any layer, including deleted ones |
| Licence policy | Syft plus a policy file | A forbidden licence in the dependency set |
| Non-root and least privilege | Hadolint and a Dockerfile lint | Missing `USER`, shell-form `ENTRYPOINT`, or a pinned base |

```yaml
- name: Scan image
  uses: aquasecurity/trivy-action@0.28.0
  with:
    image-ref: registry.example.com/ledger@${{ steps.build.outputs.digest }}
    severity: CRITICAL,HIGH
    exit-code: '1'
    ignore-unfixed: true
```

| Trap | Symptom | Fix |
| --- | --- | --- |
| Scanning a tag after push | A race lets a different digest be scanned | Scan the digest the build step outputs |
| Ignoring unfixed vulnerabilities | A gate nobody can pass, so it gets disabled | Split fixed and unfixed into two rules with different deadlines |
| Scanning only the runtime layer | A build-stage tool ships in a lower layer and is missed | Scan the final image; scanners follow history |
| Secret baked in then deleted in a later layer | The secret is still in the image | Inject at runtime, and rotate anything that ever reached a build |
| Trusting the base image tag | A push to that tag changes your next build | Pin the digest and re-pin deliberately |
