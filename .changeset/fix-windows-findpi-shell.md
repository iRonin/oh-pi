---
default: patch
---

fix `findPi()` on Windows by trying `pi.cmd` first and passing `shell: true` to `execFileSync` so the npm CMD shim is resolved correctly.
