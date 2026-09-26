# Logback Configuration

Load this when writing or restructuring `logback-spring.xml`, splitting log behaviour by environment profile, emitting structured JSON, or sizing an async appender.

## The configuration file

Only `logback-spring.xml` supports Boot extensions. A `logback.xml` is read by plain Logback before the Spring context exists, so `<springProfile>`, `<springProperty>`, and `<springBean>` silently do nothing and the file is the wrong choice.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <include resource="org/springframework/boot/logging/logback/defaults.xml"/>

  <springProperty scope="context" name="serviceName" source="spring.application.name" defaultValue="app"/>
  <springProperty scope="context" name="environment" source="ENVIRONMENT" defaultValue="local"/>

  <property name="CONSOLE_LOG_PATTERN"
            value="%d{yyyy-MM-dd'T'HH:mm:ss.SSSXXX} %5p [${serviceName},${environment}] [%X{traceId:-},%X{spanId:-}] %logger{40} - %msg%n"/>

  <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder>
      <pattern>${CONSOLE_LOG_PATTERN}</pattern>
    </encoder>
  </appender>

  <logger name="org.springframework.web" level="INFO"/>
  <logger name="org.hibernate.SQL" level="WARN"/>
  <logger name="com.acme.billing" level="INFO"/>

  <root level="INFO">
    <appender-ref ref="CONSOLE"/>
  </root>
</configuration>
```

| Element | Purpose | Trap |
| --- | --- | --- |
| `include` of `defaults.xml` | Brings Boot level defaults | Without it, Boot properties like `logging.level.*` still work but the defaults table is gone |
| `<springProperty>` | Reads from the Spring `Environment` | `scope="context"` is required; a `local` scope does not see application properties |
| `${ENVIRONMENT}` | Reads an OS environment variable | Undefined variables silently become the literal text, so always give `defaultValue` |
| `%X{traceId:-}` | MDC value with a fallback | Without the fallback, a missing key prints `null` or an empty marker that breaks log parsing |
| Root level | The floor for every logger | Lowering it is a capacity decision, not a debugging decision |

## Split behaviour by profile

```xml
<configuration>
  <include resource="org/springframework/boot/logging/logback/defaults.xml"/>

  <springProfile name="local,test">
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
      <encoder>
        <pattern>%d{HH:mm:ss.SSS} %highlight(%-5level) %cyan(%logger{36}) - %msg%n</pattern>
      </encoder>
    </appender>
    <root level="INFO">
      <appender-ref ref="CONSOLE"/>
    </root>
  </springProfile>

  <springProfile name="!local &amp; !test">
    <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
      <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <customFields>{"service":"${serviceName}","environment":"${environment}"}</customFields>
        <includeMdc>true</includeMdc>
        <includeKeyValuePairs>true</includeKeyValuePairs>
        <fieldNames>
          <timestamp>@timestamp</timestamp>
          <version>[ignore]</version>
        </fieldNames>
        <timeZone>UTC</timeZone>
      </encoder>
    </appender>

    <appender name="ASYNC_JSON" class="ch.qos.logback.classic.AsyncAppender">
      <queueSize>2048</queueSize>
      <discardingThreshold>0</discardingThreshold>
      <neverBlock>false</neverBlock>
      <appender-ref ref="JSON"/>
    </appender>

    <logger name="com.acme.billing" level="INFO"/>
    <logger name="org.springframework.web.servlet.mvc.method.annotation.ExceptionHandlerExceptionResolver" level="ERROR"/>

    <root level="INFO">
      <appender-ref ref="ASYNC_JSON"/>
    </root>
  </springProfile>
</configuration>
```

| Rule | Reason |
| --- | --- |
| Wrap the ampersand as `&amp;` in `name="!local &amp; !test"` | XML requires escaping, and a raw `&` fails the parse at startup |
| Define appenders inside the profile that uses them | A `null` appender reference fails the context |
| One root element per profile branch is allowed | Logback merges logger definitions from every matching branch |
| `<springBean>` for anything that needs a Spring bean | A data source redaction helper, for example |

## JSON output options

| Option | Output | Choose when |
| --- | --- | --- |
| `net.logstash.logback.encoder.LogstashEncoder` | One JSON object per line with MDC and key-value pairs flattened | The default choice for an ELK, Loki, or OpenTelemetry log pipeline |
| `StructuredLogEncoder` from Spring Boot | JSON with Boot-managed fields and no extra dependency | You want no third-party encoder in the build |
| `LogstashEncoder` with `<mdc/>` | MDC as a nested object rather than flattened | Your collector maps nested objects more cleanly than flat keys |
| Pattern with `%kvp` | Key-value pairs only, not full JSON | You need correlation fields and nothing else structured |

```xml
<appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
  <encoder class="net.logstash.logback.encoder.LogstashEncoder">
    <includeMdcKeyName>traceId</includeMdcKeyName>
    <includeMdcKeyName>spanId</includeMdcKeyName>
    <includeMdcKeyName>tenant</includeMdcKeyName>
    <customFields>{"service":"${serviceName}"}</customFields>
  </encoder>
</appender>
```

Allowlist the MDC keys you want in the output. Dumping every MDC entry is how a token set by a library ends up in your log collector.

## Async appender

```xml
<appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
  <queueSize>4096</queueSize>
  <!-- 0 keeps INFO and above; 20 percent discards TRACE and DEBUG when the queue is 80 percent full. -->
  <discardingThreshold>0</discardingThreshold>
  <!-- false blocks the caller when the queue is full, which preserves delivery. -->
  <neverBlock>false</neverBlock>
  <includeCallerData>false</includeCallerData>
  <appender-ref ref="JSON"/>
</appender>
```

| Setting | Default | Consequence of the default |
| --- | --- | --- |
| `queueSize` | 256 | Far too small for a burst; tune from measured peak events per second |
| `discardingThreshold` | Queue size times 0.2 | Lowest-level events are dropped without any warning once the queue is 80 percent full |
| `neverBlock` | `false` | The caller waits, which preserves delivery and converts a collector outage into request latency |
| `includeCallerData` | `false` | Enabling it costs a stack walk per event; it is expensive, so keep it off and log an explicit class name |

| Preference | Setting | Cost accepted |
| --- | --- | --- |
| Never lose a line | `discardingThreshold=0`, `neverBlock=false` | Request threads block under a log flood |
| Never slow a request | `discardingThreshold=0`, `neverBlock=true` | Lines are dropped and the loss is invisible unless a counter tracks it |
| Balanced | `discardingThreshold=0`, `neverBlock=false`, plus a `logback` internal-status alert | Bounded latency plus a real signal when the queue saturates |

Track a dropped-line counter. `ch.qos.logback.core.AsyncAppender` logs a status message when it discards, which is invisible in most collectors.

## File appender, for a local or a batch job only

```xml
<springProfile name="batch">
  <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
    <file>${LOG_DIR:-./logs}/${serviceName}.log</file>
    <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
      <fileNamePattern>${LOG_DIR:-./logs}/${serviceName}.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
      <maxFileSize>100MB</maxFileSize>
      <maxHistory>14</maxHistory>
      <totalSizeCap>5GB</totalSizeCap>
    </rollingPolicy>
    <encoder>
      <pattern>${CONSOLE_LOG_PATTERN}</pattern>
    </encoder>
  </appender>
  <root level="INFO">
    <appender-ref ref="FILE"/>
  </root>
</springProfile>
```

`totalSizeCap` is what actually bounds the disk. `maxHistory` alone does not, because a burst of large files can exceed the retention window many times over.

Never attach a file appender in the container image. There is no log rotation daemon, the file consumes the writable layer, and the platform cannot see it.

## Redaction in the encoder

```xml
<appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
  <encoder class="net.logstash.logback.encoder.LogstashEncoder">
    <customFields>{"service":"${serviceName}"}</customFields>
    <redactionPattern>
      <pattern>
        ("(?:password|passwd|secret|token|apiKey|api_key|authorization|cookie|sessionId|cardNumber|cvv)"\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]*)
      </pattern>
      <replace>$1"[REDACTED]"</replace>
    </redactionPattern>
  </encoder>
</appender>
```

A pattern redaction only covers what the message actually renders. It cannot see a field that a library logged to its own appender, so libraries that log sensitive values need their own configuration or a suppression.

## Verify

```bash
# The file parses and Boot extensions resolved.
./mvnw -B -ntp -Dspring-boot.run.profiles=local spring-boot:run

# JSON output is valid JSON, one object per line.
kubectl exec deploy/ledger -- sh -c 'cat /proc/1/fd/1' | jq -c 'select(.level=="ERROR")' | head

# A redacted value never appears.
kubectl logs deploy/ledger | grep -E '"(password|token|authorization)":"(?!\*+REDACTED)' -P || echo "clean"

# Levels are what was intended.
kubectl logs deploy/ledger | head -200 | jq -r '.logger' | sort -u
```
