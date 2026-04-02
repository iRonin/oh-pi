---
default: patch
---

Add safe mode awareness to the scheduler extension, reducing tick frequency and suppressing UI status updates when safe mode is active. Fix memory leak in dispatch timestamp tracking by replacing unbounded `shift()` pruning with a capped `splice()` approach and clearing timestamps on scheduler stop.
