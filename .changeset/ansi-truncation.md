---
default: patch
---

### Fix usage dashboard truncation cutting through ANSI escape codes

The `/usage` overlay and `Ctrl+U` dashboard now use ANSI-aware line truncation.
Previously, lines were sliced by raw string length which could cut through ANSI
escape sequences mid-code, causing garbled colors and broken terminal rendering.

The new `truncateAnsi()` helper walks the string character by character, skipping
ANSI sequences when counting visible width, and appends a reset (`\x1b[0m`) if
the line is trimmed inside a styled region.
