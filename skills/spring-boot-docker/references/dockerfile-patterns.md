# Dockerfile Patterns

Load this when writing or reviewing a Dockerfile for a Spring Boot 3.5 service on Java 21, including layered jar extraction, jlink runtimes, non-root execution, and build context control.

## Stage graph

| Stage | Base | Contains | Exists to serve |
| --- | --- | --- | --- |
| `builder` | JDK 21 distribution | Maven wrapper, sources, target output, extracted layers | Layered extraction and reproducibility |
| `runtime` | `eclipse-temurin:21-jre` | Four jar layers, nothing else | The deployed process |

A `native` stage is justified only when a native binary is a required output, since every extra stage is another base image to patch and re-pin.

## The layered jar Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
ARG RUNTIME_IMAGE=eclipse-temurin:21-jre
ARG BUILD_IMAGE=eclipse-temurin:21-jdk

FROM ${BUILD_IMAGE} AS builder
ARG SOURCE_DATE_EPOCH=0
WORKDIR /build

# Dependency layer is rebuilt only when the build definition changes.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B -ntp dependency:go-offline
COPY src src
RUN ./mvnw -B -ntp -DskipTests package \
    -Dproject.build.outputTimestamp=${SOURCE_DATE_EPOCH}

# Boot 3.3+ uses the tools jar mode. Boot 3.2 and earlier use layertools extract.
RUN java -Djarmode=tools -jar target/*.jar extract --layers --destination extracted

FROM ${RUNTIME_IMAGE} AS runtime

RUN groupadd --system --gid 1001 app \
 && useradd --system --uid 1001 --gid 1001 --no-create-home --shell /usr/sbin/nologin app \
 && mkdir -p /app/tmp \
 && chown -R 1001:1001 /app

WORKDIR /app
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=75.0 -XX:+UseParallelGC -XX:+ExitOnOutOfMemoryError -Djava.io.tmpdir=/app/tmp"
ENV TZ=UTC
COPY --from=builder --chown=1001:1001 /build/extracted/dependencies/           ./
COPY --from=builder --chown=1001:1001 /build/extracted/spring-boot-loader/      ./
COPY --from=builder --chown=1001:1001 /build/extracted/snapshot-dependencies/  ./
COPY --from=builder --chown=1001:1001 /build/extracted/application/             ./
USER 1001:1001
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

| Decision | Why |
| --- | --- |
| `dependency:go-offline` before copying sources | The dependency layer is invalidated only by `pom.xml`, not by any source edit |
| `ARG` before `FROM` for base images | Only a global-scope `ARG` is usable inside a `FROM` line |
| Numeric `USER 1001:1001` | Kubernetes `runAsUser` can then match; a name cannot be resolved by the orchestrator |
| `STOPSIGNAL SIGTERM` | Documents the contract even though it is the Docker default |
| `TZ=UTC` | Container-local time zones make log correlation across replicas wrong |

`JAVA_TOOL_OPTIONS` is echoed on every start, so the flags are verifiable in a log. `JAVA_OPTS` is not read by the JVM; only pass it if an entrypoint script expands it, and a script reintroduces shell-form signal problems.

## Layer order and what invalidates each layer

| Layer | Copied from | Invalidated by | Copy time on a code-only change |
| --- | --- | --- | --- |
| `dependencies/` | `target/*.jar` dependencies directory | Dependency version or exclusion change | Cached |
| `spring-boot-loader/` | Boot loader classes | Boot version change only | Cached |
| `snapshot-dependencies/` | Snapshot dependency directory | A snapshot dependency timestamp change | Cached normally |
| `application/` | Application classes, resources, and the jar manifest | Any source or resource change | Rebuilt |
| `tmp/` | Empty directory, owned by the runtime user | Nothing | Unchanged |

Never `COPY src src` into the runtime stage: it defeats extraction and ships source code into production.

## The `.dockerignore`

```text
# Build outputs: the builder stage produces them.
target/
build/
out/

# VCS, IDE, and local environment
.git/
.github/
.idea/
.vscode/
*.iml
.env
.env.*
!.env.example

# Logs, coverage, and scratch
*.log
logs/
target/site/
*.hprof
```

| Trap | Symptom | Fix |
| --- | --- | --- |
| Ignoring `mvnw` or `.mvn/` | The builder stage fails on `COPY mvnw` even though the file exists locally | Never ignore the wrapper; the builder needs it |
| Ignoring `.git` when a build reads it | A git-metadata plugin fails late with a version of `unknown` | Set an explicit version in `pom.xml` instead of reading git |
| Not ignoring `target/` | A stale local build is copied in and shadows the built output | Always ignore it |
| Not ignoring `.env` | Local secrets bake into a layer permanently, where they survive a later `RUN rm` | Inject secrets at runtime, never at build time |
| Ignoring everything then re-including a jar | The `!` re-include never applies because the parent directory is excluded | Re-include the parent path first |

Layer history is part of your security posture. Anything written to a layer in an earlier stage stays in the image even if a later stage deletes it. A `.dockerignore` that ignores `mvnw` or `.mvn/` breaks the builder stage outright, because `COPY` reads the filtered context.

## The fat-jar copy, and when it is acceptable

```dockerfile
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /build/target/app.jar /app/app.jar
USER 1001
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

Acceptable for a short-lived job, a small dependency set, or a pipeline that already produces an SBOM from the artifact. Not acceptable for a long-running service that ships weekly: every release pushes the full jar and the application-layer cache is worthless.

## jlink runtime with buildpacks

Buildpacks produce a jlink runtime when the Maven build declares the buildpacks plugin and a BPF descriptor. For a hand-written jlink variant, the shape is:

```dockerfile
FROM eclipse-temurin:21-jdk-jammy AS builder
WORKDIR /build
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B -ntp dependency:go-offline
COPY src src
RUN ./mvnw -B -ntp -DskipTests package \
 && java -Djarmode=tools -jar target/*.jar extract --layers --destination extracted

FROM eclipse-temurin:21-jdk-jammy AS jlink
ARG BPF_JLINK_VERSION=jdk-21.0.2+11-6
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates fontconfig \
 && curl -fsSL -o /tmp/bpf.tar.gz "https://github.com/spring-projects/spring-boot/releases/download/v3.5.0/bpf-${BPF_JLINK_VERSION}.tar.gz" \
 && tar -xzf /tmp/bpf.tar.gz -C /tmp \
 && /tmp/bpf-jlink --layers --distribution extracted \
      --dependencies extracted/dependencies --application extracted/application \
      --source-directory /build --target-directory runtime \
 && rm -rf /tmp/bpf.tar.gz /tmp/bpf /tmp/bpf-jlink

FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
COPY --from=jlink /build/runtime/ /
USER 1001
ENTRYPOINT ["/project/spring-boot-application"]
```

jlink removes JDK modules your application never touches, which typically shaves 20 to 40 MB. The cost is real: the produced image is bound to the exact jlink input, the entrypoint is not `java -jar`, and debugging requires a matching JDK. The buildpacks plugin performs the same extraction and entrypoint wiring from a maintained descriptor.

```xml
<plugin>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-maven-plugin</artifactId>
  <configuration>
    <image>
      <name>registry.example.com/${project.artifactId}:${project.version}</name>
      <builder>paketobuildpacks/builder:base-jammy-tiny:latest</builder>
      <runImage>eclipse-temurin:21-jre-jammy</runImage>
      <env>
        <BPF_JLINK_VERSION>jdk-21.0.2+11-6</BPF_JLINK_VERSION>
      </env>
    </image>
  </configuration>
</plugin>
```

## Compose parity for local development

```yaml
services:
  ledger:
    build:
      context: .
      dockerfile: Dockerfile
    image: registry.example.com/ledger:local
    environment:
      SPRING_PROFILES_ACTIVE: local
      ACME_LEDGER_URL: http://host.docker.internal:8081
    ports: ["8080:8080"]
    tmpfs: ["/app/tmp:size=64m"]
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/actuator/health/readiness"]
      interval: 10s
      timeout: 2s
      retries: 5
    mem_limit: 768m
```

| `mem_limit` | Gives the JVM a real cgroup limit locally, so `MaxRAMPercentage` is exercised as in production |
| `tmpfs` for `/app/tmp` | Matches an ephemeral, size-bounded writable path, keeping the root read-only capable |
| `healthcheck` with `curl` | Requires a runtime with curl; use a probe binary if the base has neither curl nor wget |
| `host.docker.internal` | Reaches a host service without hardcoding a per-machine IP |

## Verify the result

```bash
# Signals reach the JVM as PID 1 and the process exits within the grace period.
docker run --rm --name sigterm-probe -p 8080:8080 ledger:local &
docker stop --time 30 sigterm-probe && wait $!; echo "exit=$?"

# The heap is derived from the cgroup limit, not hardcoded.
docker run --rm -m 768m --entrypoint sh ledger:local -c \
  'java -XX:+PrintFlagsFinal -version 2>/dev/null | grep -E "MaxHeapSize|InitialHeapSize"'

# An OOM is a non-zero exit rather than a hung process.
docker run --rm -m 128m --entrypoint sh ledger:local -c \
  'java -XX:MaxRAMPercentage=95.0 -XX:+ExitOnOutOfMemoryError -jar /app/app.jar'

# Nothing forbidden entered the image.
docker history --no-trunc ledger:local | grep -Ei "apt-get install|mvnw -B" || true
```
