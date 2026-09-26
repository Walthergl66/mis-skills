---
name: spring-boot-docker
description: 'Use when building or reviewing a container image for a Spring Boot service, including Dockerfile design, layered jars, multi-stage builds, jlink runtimes, GraalVM native images, Cloud Native Buildpacks, .dockerignore, non-root execution, JVM container flags, MaxRAMPercentage, signal handling, image size, and build reproducibility. Triggers include Dockerfile, ENTRYPOINT java -jar, spring-boot-layertools, jarmode tools extract, eclipse-temurin, bpj, buildpacks, native-maven-plugin, OOMKilled, image layer caching, and CI image parity. Do not use for pipeline stages, registry publishing, or deployment strategy, nor for runtime property configuration. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Boot Container Images

Own how the service becomes a container image: base runtime, jar layering, stage boundaries, JVM ergonomics inside the cgroup limit, process identity, and layer order. An image is the unit of immutability in every later stage, so a sloppy build here is paid for by every pipeline, cache, and rollback decision that follows.

## When to use

- Writing or refactoring a `Dockerfile` for a Boot service.
- Deciding between a fat-jar copy, layer extraction, jlink, buildpacks, or a native image.
- A container is OOMKilled, restarts, or never receives `SIGTERM` cleanly.
- Heap sizing disagrees with the memory limit the orchestrator sets.
- Image is larger than it should be, or every code change invalidates the dependency layer.
- Aligning the local image, the CI image, and the deployed digest.
- Deciding what belongs in the build context.

## When not to use

- Pipeline stages, gates, registry login, and promotion belong to `spring-boot-ci-cd`.
- Binding runtime properties, secrets, and profile selection belongs to `spring-boot-core`.
- Shutdown sequence, probes, and termination behaviour belong to `spring-boot-actuator`.
- Provisioning databases, brokers, and dependencies for tests belongs to `spring-boot-testcontainers`.
- Log format, MDC, and async appenders belong to `spring-boot-logging`.

## Ownership and sibling boundaries

This skill owns image construction and container hygiene only.

- `spring-boot-ci-cd` owns when the image is built and where it is published. Hand it the Dockerfile and the digest-producing command.
- `spring-boot-core` owns how the image is configured once it runs. Hand it the env-var and profile contract that the `ENTRYPOINT` must not hardcode.
- `spring-boot-actuator` owns readiness, probes, and graceful drain. Hand it the requirement that `SIGTERM` reaches the JVM as PID 1.
- `spring-boot-testcontainers` owns disposable infrastructure images. Hand it dependency provisioning when a test needs a real broker.
- `spring-boot-logging` owns what the image writes to stdout. Hand it the log destination contract.

## Hard rules

1. **`ENTRYPOINT` is exec form and `java` is PID 1.** `ENTRYPOINT ["java","-jar","/app/app.jar"]`, never the shell form. A shell-form entrypoint makes `java` a child of `/bin/sh -c`, so `SIGTERM` never reaches the JVM and every shutdown times out.
2. **Never hardcode `-Xmx`.** The JVM reads the cgroup limit at startup; `-Xmx512m` in an image is wrong in every environment except the one it was guessed in. Set `-XX:MaxRAMPercentage` instead.
3. **Run as a non-root user with a fixed numeric UID.** A random UID from a random base image breaks bind-mounted storage permissions and cache directories.
4. **A writable temp directory is mandatory.** `java.io.tmpdir` defaults to `/tmp`; make it exist and be owned by the runtime user.
5. **Copy from the narrowest set of build outputs.** Maven, Git, the wrapper distribution, and the target directory never enter the runtime stage.
6. **Layer order is the caching contract.** Least volatile first: dependencies, loader, snapshot dependencies, application classes and resources.
7. **Pin the base image by digest**, not by a floating tag, or the image is not reproducible even when the build is.
8. **Build once, promote the digest.** Never rebuild per environment; the runtime layer is configuration, not code.
9. **If the image does not need the JDK, the JDK must not be in it.** A `COPY --from=builder /build/target/*.jar` fat copy is acceptable only when size does not matter, which is almost never true.

## Why extraction beats a fat-jar copy

| Aspect | `COPY target/app.jar` | Extracted layers with `-Djarmode=tools` |
| --- | --- | --- |
| Cache hits on a code-only change | 0, the whole jar layer changes | 4 of 5 layers reused, only `application/` invalidates |
| Local push/pull time | Full jar each time | Only the `application/` layer moves |
| Filesystem overlay | One large layer, the rest of the filesystem is the base image | Thin overlay, only changed files are diffed |
| Debuggability | Identical | Identical, plus per-layer provenance |
| Startup cost | Same | Same |
| Build complexity | One line | One extra build step |

Boot 3.3 and later extract with the jar tool mode; older layouts use `spring-boot-layertools extract`.

```bash
java -Djarmode=tools -jar target/app.jar extract --layers --destination extracted
```

The four directories the runtime stage copies are `dependencies/`, `spring-boot-loader/`, `snapshot-dependencies/`, and `application/`.

## JVM ergonomics inside a container

| Flag | Effect | Rule |
| --- | --- | --- |
| `-XX:MaxRAMPercentage=75.0` | Heap is 75 percent of the detected container limit | Keep the remaining 25 percent for metaspace, code cache, thread stacks, and direct buffers |
| `-XX:InitialRAMPercentage=75.0` | Avoids a heap resize storm at startup | Pair it with `MaxRAMPercentage` or set the initial ratio alone |
| `-XX:+UseParallelGC` | Throughput collector, lower footprint and overhead than G1 on many-core containers | Default note for services; re-evaluate with a load test before changing it |
| `-XX:MaxDirectMemorySize` | Bounds off-heap use of Netty and NIO direct buffers | Needed when the container limit is close to the heap ratio |
| `-XX:+ExitOnOutOfMemoryError` | Die fast on OOM instead of limping | Pair with a restart policy; an OOM that does not exit is an outage |
| `-XX:+HeapDumpOnOutOfMemoryError` | Post-mortem evidence | Only with a writable volume and an upload path, never in a read-only root filesystem |
| `-Xmx` or `-Xms` | Hardcoded absolute heap | Never ship these in an image |

A heap dump on an ephemeral container filesystem fills the disk and blocks the restart. If you need it, mount a volume and set `-XX:HeapDumpPath` explicitly.

## Buildpacks, jlink, or native image

| Option | Startup | Image size | Build time | Maintenance | Choose when |
| --- | --- | --- | --- | --- | --- |
| Layered jar on a JRE base | Baseline | Baseline | Baseline | Low | Default for every long-running service |
| Buildpacks via `spring-boot:build-image` | Baseline | Smallest JVM image | Medium | Lowest, no Dockerfile | You want fewest image defects and accept pack build time |
| jlink custom runtime via BPF | Baseline | Smallest possible | Medium | Medium | You need a minimal runtime that still supports the full JDK feature set |
| GraalVM native image | Tens of milliseconds | 20 to 60 MB | Minutes per build | Highest | Serverless, scale-from-zero, CLI, or aggressive memory limits |
| Distroless or scratch | Baseline | Smallest | Baseline | High | Only when a JVM-native base plus a shell already satisfies the base requirement |

Native image is a tradeoff, not an upgrade. It needs reachability metadata for every reflective path, it breaks dynamic classpath tricks, and its build time will dominate short CI cycles. Enable it on an explicit request with a reflection-config audit and a real latency benchmark.

## Reproducibility

- Pin the runtime base image by digest and re-pin on a schedule, not on every build.
- Set `-Dproject.build.outputTimestamp` to a fixed ISO-8601 value or to `SOURCE_DATE_EPOCH` so jar entry timestamps are stable.
- Pin the JDK and Maven versions in the build stage; a floating builder tag is a non-reproducible build.
- Record the image digest in the pipeline and treat the digest, not the tag, as the deployment identity.

## Reference routing

| Task | Load |
| --- | --- |
| Write a multi-stage layered Dockerfile, a jlink variant, a `.dockerignore`, or a non-root runtime | [dockerfile-patterns.md](references/dockerfile-patterns.md) |
| Choose and harden a base image, pick buildpacks over a Dockerfile, evaluate native image, add SBOM, signing, and scan gates | [image-hardening.md](references/image-hardening.md) |

## Expected response

- **Chosen image strategy:** layered jar, buildpacks, jlink, or native image, with the concrete reason it beats the alternatives here.
- **Full Dockerfile or Maven build-image config,** with exec-form `ENTRYPOINT`, a non-root `USER`, and the JVM flags justified against the memory limit.
- **Cache and layer plan:** what invalidates on a dependency change versus a code change, and the resulting rebuild cost.
- **Runtime contract:** what the image expects from configuration, and what it deliberately does not bake in.
- **Hygiene findings:** build context leakage, writable paths, PID 1 and signal handling, heap sizing, and base image pinning.
- **Verification:** a command that proves signal delivery, memory fit, and a non-zero exit on OOM.
