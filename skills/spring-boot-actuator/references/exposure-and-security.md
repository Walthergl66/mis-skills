# Exposure and Security

Load this when choosing an Actuator exposure list, moving management onto its own port, protecting it, or deciding what must never be reachable from outside the cluster.

## The exposure decision

| Endpoint | What it returns | Default exposure | Decision |
| --- | --- | --- | --- |
| `health` | Aggregate and per-indicator status | Exposed | Always expose; restrict details |
| `info` | Build metadata from contributors | Exposed | Restrict contributors to non-sensitive keys |
| `prometheus` | Full metric scrape | Not exposed | Expose only on a scrape-authenticated network |
| `metrics` | Meter names, tags, and values | Not exposed | Prefer `prometheus`; drop `metrics` in production |
| `loggers` | Logger names and levels, and a POST that changes them | Not exposed | An operator tool; never internet-reachable |
| `env` | Every property with its value and origin | Not exposed | Dev and debug profile only |
| `configprops` | Every bound properties object | Not exposed | Dev and debug profile only |
| `threaddump` | Full thread dump | Not exposed | Break-glass, authenticated, audited |
| `heapdump` | Heap contents, including secrets in memory | Not exposed | Never expose; it is a data export |
| `shutdown` | Triggers application close | Not exposed | Never enable outside a fully locked-down network |
| `conditions` | The full auto-configuration report | Not exposed | Dev and debug profile only |
| `caches`, `sessions`, `scheduledtasks`, `startup`, `flyway`, `liquibase` | Runtime internals | Not exposed | Include only if a platform component consumes them |

`include: "*"` in a production configuration is a defect. It is a list of every endpoint above, most of which exist to be read by a developer at a desk, not by a load balancer.

## Port separation

```yaml
server:
  port: 8080
management:
  server:
    port: 9090
    address: 0.0.0.0
```

| Property | Effect | Consequence |
| --- | --- | --- |
| `management.server.port` | Management endpoints on a separate port | The application port stays free of operator endpoints |
| `management.server.address` | Binds management to one interface | Bind the interface the operator or scraper can actually reach; `127.0.0.1` works for a sidecar but makes the port unreachable from a kubelet probe |
| `management.endpoints.web.base-path` | Path prefix, default `/actuator` | A non-default prefix reduces accidental discovery, not real access control |
| `management.endpoints.web.exposure.include` | Which endpoints exist over HTTP | The actual allowlist |
| `management.endpoint.<id>.enabled` | Whether an endpoint is registered at all | `false` is stronger than a narrow `include` for endpoints nothing consumes |
| `management.server.ssl.enabled` | TLS on the management port | Required wherever the port leaves a trusted network |

A separate port alone is not security. Anything that can route to the pod can route to port 9090. Separation buys a narrower network policy, a lighter filter chain, and a place to apply a stricter firewall rule.

```java
package com.acme.billing.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
public class ManagementSecurityConfig {

    @Bean
    @Order(1)
    SecurityFilterChain managementFilterChain(HttpSecurity http) throws Exception {
        http.securityMatcher("/actuator/health/**", "/actuator/prometheus")
            .authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
            .csrf(csrf -> csrf.disable());
        return http.build();
    }
}
```

| Layer | Mechanism | Protects against |
| --- | --- | --- |
| Network | Pod labels, network policy, security group | Anything not on the management network |
| Transport | TLS on the management port | Eavesdropping on a scrape or a break-glass call |
| Application | `SecurityFilterChain` scoped to the management matcher | Unauthenticated endpoint access |
| Endpoint | `show-details`, `info.env.keys`, per-endpoint `enabled` | Leaking configuration through an endpoint that must be reachable |
| Process | Read-only root filesystem, no shell | A dump written to disk after an endpoint call |

A `SecurityFilterChain` is selected by the first chain whose matcher matches, evaluated in `@Order` sequence, so the management chain must be ordered **before** the catch-all application chain. Ordering it last means the application chain answers first and a probe can be denied by application rules.

## What must never be exposed

| Item | Reason | Alternative |
| --- | --- | --- |
| `heapdump` | Contains every secret, token, and PII value resident in memory | Attach a debugger in a controlled session |
| `shutdown` | Remote unauthenticated termination is a denial of service | `kubectl delete pod` with RBAC |
| `env` and `configprops` in production | Print configuration values; masking is key-name based and incomplete | `application.yaml` in the repository |
| `loggers` write access | Enables DEBUG on any package at runtime, which is a capacity and data-exposure change | A configuration change with a rollback |
| A build with a secret in a property | `env` and `configprops` will print it | Runtime secret injection |
| `threaddump` unauthenticated | Internals disclosure plus a thread-dump storm as a denial of service | Break-glass, authenticated, with an audit record |
| `conditions` unauthenticated | Full dependency and auto-configuration inventory | A debug profile on a non-routable environment |

## Health details and gating

```yaml
management:
  endpoint:
    health:
      show-details: never
      show-components: never
      show-annotations: never
      roles: admin
      status:
        http-mapping:
          down: 503
          out-of-service: 503
        order: down,out-of-service,up,unknown
  info:
    env:
      enabled: true
      keys: [app.release, git.commit.id]
```

| Property | Values | Effect |
| --- | --- | --- |
| `show-details` | `never`, `when-authorized`, `always` | Whether per-indicator details appear in the body |
| `show-components` | `never`, `when-authorized`, `always` | Whether the component list appears |
| `show-annotations` | `never`, `when-authorized`, `always` | Whether indicator annotations appear |
| `status.roles` | Role names | The authority that unlocks details when set to `when-authorized` |
| `status.order` | Ordered list | Which status wins when several are present |
| `status.http-mapping` | Status to HTTP code | The code a probe interprets |

`show-details: always` in production is a common accident and a real disclosure: the details block contains exception class names, connection targets, and any detail an indicator chose to add. Set it per environment and verify the rendered response, not the property.

## Info contributors

```java
package com.acme.billing.info;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.actuate.info.Info;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.boot.info.BuildProperties;
import org.springframework.stereotype.Component;

@Component
public class ReleaseInfoContributor implements InfoContributor {

    private final BuildProperties buildProperties;

    public ReleaseInfoContributor(BuildProperties buildProperties) {
        this.buildProperties = buildProperties;
    }

    @Override
    public void contribute(Info.Builder builder) {
        Map<String, Object> release = new LinkedHashMap<>();
        release.put("version", buildProperties.getVersion());
        release.put("buildTime", buildProperties.getTime());
        release.put("commit", buildProperties.get("git", Map.class)
                .map(git -> git.get("commit", Map.class).get("id"))
                .orElse("unknown"));
        builder.withDetail("release", release);
    }
}
```

```xml
<plugin>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-maven-plugin</artifactId>
  <configuration>
    <buildInfo>
      <additionalProperties>
        <git.commit.id>${git.commit.id}</git.commit.id>
      </additionalProperties>
    </buildInfo>
  </configuration>
  <executions>
    <execution>
      <goals><goal>build-info</goal></goals>
    </execution>
  </executions>
</plugin>
```

`git.commit.id` must be a real build input. A `git-commit-id-plugin` that fails on a shallow clone produces `unknown` in production, which is exactly the field an operator needs during an incident. Pass it as a build argument from the pipeline instead.

An `info` detail that reports the running version is the cheapest deployment marker available: it lets an operator confirm the live revision without a shell into the pod.

## Diagnose the management surface

```bash
# What is registered, and what is exposed.
curl -s http://localhost:9090/actuator | jq .

# Verify details are hidden in production.
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:9090/actuator/health
curl -s http://localhost:9090/actuator/health | jq 'has("components")'

# Prove env and configprops are absent.
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:9090/actuator/env
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:9090/actuator/configprops

# Confirm the running revision.
curl -s http://localhost:9090/actuator/info | jq .

# Prove the endpoint set is not the wildcard set.
docker run --rm ledger:1.4.2 sh -c 'true' && \
  kubectl get deploy ledger -o jsonpath='{.spec.template.spec.containers[0].env}' | jq -c '.[] | select(.name=="MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE")'
```

| Observation | Meaning | Action |
| --- | --- | --- |
| `404` on an endpoint | Not in the include list, or disabled | Add it only if something consumes it |
| `401` on a probe path | The application chain is winning over the management chain | Reorder the `SecurityFilterChain` beans |
| `503` on readiness at boot | A dependency is not up yet | Add a startup group or a pre-stop ordering fix |
| `200` on readiness with a slow first request | Lazy initialization, and the probe is warming the cache | Accept it, and set the probe thresholds accordingly |
| An endpoint present that nothing calls | Accumulated exposure | Remove it in the next change |
