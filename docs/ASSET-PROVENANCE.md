# Asset provenance checklist

This inventory is a release gate, not a declaration that every asset is
already legally cleared. Maintainers must confirm ownership or permission
before publishing a public mirror.

| Asset | Location | Current status | Required action |
| --- | --- | --- | --- |
| Replofy logo and compact mark | `src/assets/logo-compact.png` | Needs confirmation | Confirm project ownership or add the applicable license/permission. |
| Readiness-audit screenshot | `docs/replofy-os-current-ui.png` | Local capture | Confirm it contains no private data and may be redistributed. |
| Generated exports and emulator data | `dist/`, `.tmp/`, `emulator_data/` | Build/runtime output | Keep ignored or regenerate from a clean checkout; do not publish private state. |

Do not add customer data, private screenshots, generated provider output, or
third-party brand assets to the repository without recording the source and
permission here.
