# AIHub Smart Group Userscript Design

## Goal

Build a Tampermonkey userscript for `https://aihub.top/providers` and
`https://aihub.top/keys` that recommends the cheapest sufficiently reliable
provider group and can switch an existing API key to that group.

## Confirmed Site Contracts

- Monitor summary: `GET /api/v1/public/monitor/summary`
- User API keys: `GET /api/v1/keys`
- Change a key group: `PUT /api/v1/keys/{keyId}` with
  `{ "group_id": groupId }`
- The site's existing provider action opens
  `/api-keys/create?group_id={groupId}`. It creates a key rather than changing
  an existing key.

Authenticated requests reuse the current page's `auth_token` from
`localStorage`. The userscript must never persist or display that token or a
complete API key.

## Recommendation Rules

The default eligibility rules are:

- `enabled !== false`
- `available === true`
- positive numeric `group_id`
- finite non-negative `priceMultiplier`
- six-hour success rate at least 95%
- 24-hour success rate at least 90%
- no monitor warnings

Eligible groups are ordered by multiplier ascending, then six-hour success
rate descending, 24-hour success rate descending, first-token latency
ascending, and name ascending. A recommendation becomes stable after the same
group wins two consecutive checks.

## User Experience

A compact fixed panel appears on both supported pages. It shows:

- monitoring state and last refresh time
- the stable recommendation and its multiplier, success rates, and latency
- up to five eligible groups in sorted order
- a target-key selector using key ID, name, and current group only
- manual refresh and confirmed one-click switching
- an auto-switch toggle, disabled by default
- settings for reliability thresholds, warning policy, consecutive checks,
  polling interval, and switch cooldown

Manual switching always shows a confirmation prompt. Enabling automatic
switching also requires confirmation. Automatic switching requires a stable
recommendation, a selected key, a different target group, and an expired
cooldown.

## Storage And Security

Only settings, the selected key ID, and the timestamp/target of the last
successful switch are persisted through Tampermonkey storage. API keys and
authentication tokens are never stored. Requests are same-origin and use the
current AIHub login session.

## Failure Handling

Network and authentication failures are shown in the panel without changing a
key. Invalid monitor rows are ignored. A failed switch does not start the
cooldown. Polling continues after transient failures.

## Testing

The userscript exposes pure recommendation and switching-decision functions
to Node when loaded outside a browser. Node's built-in test runner covers
filtering, ordering, consecutive stability, cooldown behavior, configuration
normalization, and redaction-safe key projection. Browser verification checks
panel rendering, live monitor loading, key selection, and absence of console
errors without performing a group change.
