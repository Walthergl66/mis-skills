# Deprecation and Migration

Load this when classifying a change against a published contract, emitting deprecation and sunset signaling, analyzing which versions are actually used, or executing the removal of a retired version.

## Change classification

Compatibility is judged from the client: a change is breaking when a client built against the previous contract can start failing, lose data it reads, or misinterpret a value.

| Change | Classification | Reason |
| --- | --- | --- |
| New optional field with a default | additive | a client that ignores unknown fields is unaffected |
| New optional field with a null default | additive, with caveat | strict clients that reject unknown properties fail |
| New endpoint | additive | nothing existing changes |
| New error `code` value | additive, with caveat | exhaustive switch matchers in clients may throw |
| New enum value | breaking for strict clients | deserialization of an unknown constant fails |
| New required field | breaking | an old payload cannot satisfy validation |
| Optional field made required | breaking | previously valid payloads are rejected |
| Field removed or renamed | breaking | the client loses or must rename a read |
| Type narrowed, such as string to enum or integer to enum | breaking | previously accepted values now fail |
| Constraint tightened, such as `maxLength` 255 to 64 | breaking | existing payloads start failing |
| Status code changed | breaking | clients branch on the status |
| Null convention changed, explicit null to omitted | breaking | clients distinguishing them change behavior |
| New response field on an error body | additive | unless the client parses strictly |
| New required request header | breaking | old clients omit it |
| New optional request header with the old default behavior | additive | behavior is preserved when absent |
| New rate limit or quota | breaking for a client at the limit | operationally breaking, not structurally |
| Pagination default page size lowered | breaking | clients receive fewer items than before |
| Endpoint removed after a deprecation window | breaking after the announced date | allowed only with the announced timeline honored |

Before declaring a change breaking, test the additive options in this order: add an optional field; add a new endpoint and keep the old behavior; add a new status code instead of changing an existing one; accept both old and new values with a tolerant parser; add a parallel endpoint instead of altering the existing one; only then version.

## Deprecation headers

| Header | Specification | Value | Meaning |
| --- | --- | --- | --- |
| `Deprecation` | RFC 9745 | `@<unix-seconds>` or `true` | when the resource was deprecated, not when it is removed |
| `Sunset` | RFC 8594 | HTTP-date | when it stops being served |
| `Link` | RFC 9745, RFC 8594 | `<url>; rel="deprecation"` and `<url>; rel="sunset"` | where to read the migration guide and the removal notice |

```java
package com.example.orders.web;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import org.springframework.http.HttpHeaders;

public final class DeprecationSignal {

    private static final DateTimeFormatter HTTP_DATE =
            DateTimeFormatter.ofPattern("EEE, dd MMM yyyy HH:mm:ss 'GMT'", java.util.Locale.US);

    private DeprecationSignal() {
    }

    public static HttpHeaders forVersion(String migrationGuide, Instant deprecatedAt, Instant sunset) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.LINK, "<" + migrationGuide + ">; rel=\"deprecation\"; type=\"text/html\"");
        headers.set("Deprecation", "@" + deprecatedAt.getEpochSecond());
        headers.set("Sunset", HTTP_DATE.format(sunset.atZone(ZoneOffset.UTC)));
        return headers;
    }
}
```

Emit them from the deprecated version on every response, including error responses:

```java
package com.example.orders.web;

import java.io.IOException;
import java.time.Instant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
class DeprecationHeaderFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getRequestURI().startsWith("/api/v1/")) {
            HttpHeaders headers = DeprecationSignal.forVersion(
                    "https://docs.example.com/migrations/orders-v2",
                    Instant.parse("2026-01-15T00:00:00Z"),
                    Instant.parse("2026-09-01T00:00:00Z"));
            headers.forEach((name, values) -> values.forEach(value -> response.addHeader(name, value)));
        }
        chain.doFilter(request, response);
    }
}
```

When Spring Framework API versioning is enabled, prefer `ApiVersionConfigurer.setDeprecationHandler` with the built-in `StandardApiVersionDeprecationHandler`, which emits `Deprecation`, `Sunset`, and `Link` from centrally declared version metadata instead of a path-matching filter. Declare a version deprecated once, in configuration, not in every controller.

Rules: the deprecation date is the day the headers start, not the removal date; the sunset date is a commitment, so choose it from capacity and communication, not from the current sprint; a `Deprecation: true` value carries no date and is a weaker signal, so prefer the timestamp; a removed version returns `410 Gone`, or a `400` problem with `code=API_VERSION_REMOVED`, never a bare `404`.

## Usage evidence

Removal is authorized by measurement, never by the calendar.

| Signal | Source | Question answered |
| --- | --- | --- |
| Request count per version | counter metric tagged with the resolved version | is anyone still calling |
| Distinct consumers per version | dimension by client id or API key | who to contact |
| Error rate per version | counter by version and `code` | is the old version failing after a server change |
| Latency per version | timer by version | which version to serve from the newer, faster path |
| First and last seen per version | gauge from a timestamped counter | how long the remaining traffic has been alive |

Instrument the resolved version, not the raw path, so a header-versioned API is counted correctly. Keep the raw path as a second dimension for debugging. Alert when a version scheduled for removal still receives traffic, so the decision is revisited before the deadline rather than after.

## Removal sequence

1. Confirm zero traffic for the agreed window, and identify the last known consumer if any.
2. Announce the exact removal date in the changelog and in the document for the version being removed.
3. Stop accepting new usage: keep serving, but log and count every remaining call with the consumer identity.
4. Contact remaining consumers individually with the migration guide and a firm date.
5. On the removal date, delete the controller, DTOs, mappings, and tests for that version in one change.
6. Keep the shared service and domain code; remove only the transport layer of the retired version.
7. Add a tombstone for a grace period: `410 Gone` with a `Link` to the migration guide, so a late caller learns why rather than seeing a routing error.
8. Keep the version tag in logs and metrics for the grace period, so the tombstone traffic is visible.
9. After the grace period, return `404` and remove the tombstone.
10. Record the removal in the API changelog with the date, the evidence, and the migration guide.

Rules: never remove a version and a shared field mapping in the same change; never remove a version while a scheduled release is already promising support for it; if traffic is non-zero at the removal date, extend the window and publish the new date rather than breaking a consumer; keep the last version number out of circulation, so `v2` never silently means something else.

## Migration guide template

| Section | Content |
| --- | --- |
| What changed | the field, status, or behavior, in one sentence |
| Why | the constraint that forced the change |
| Before | a real request and response from the old version |
| After | the equivalent request and response in the new version |
| Field mapping | old to new, including the type and nullability change |
| Behavior change | anything a client must decide differently |
| Effort | the estimated change for a client |
| Deadline | the sunset date with the timezone |
| Contact | the team or channel for questions |

Rules: always show a field mapping table, because most migrations are renames or type changes; state the deadline with an explicit date and timezone; never describe a migration as a one-line change without showing the payload difference.

## Review checklist

- Every proposed change is classified additive or breaking from the client side.
- The additive options were enumerated before choosing a version.
- Deprecation headers are emitted on every response of the deprecated version, errors included.
- `Deprecation` carries the deprecation timestamp, `Sunset` carries an HTTP-date, and both link to the guide.
- The version metric exists and is alertable, and the removal threshold is written down.
- The removal deletes only the transport layer and keeps the shared service code.
- A tombstone answers with `410` or `code=API_VERSION_REMOVED` for a grace period.
- The changelog, the document, and the migration guide agree on the dates.
