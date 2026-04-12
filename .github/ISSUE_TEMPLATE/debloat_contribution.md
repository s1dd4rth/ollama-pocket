---
name: Debloat list contribution
about: Submit or extend a vendor debloat manifest for scripts/debloat.sh
title: 'debloat: add <vendor> list'
labels: enhancement, debloat
---

## Device

- **Manufacturer (ro.product.manufacturer):**
- **Model (ro.product.model):**
- **Android version:**
- **OS skin (One UI / MIUI / stock / …):**

## New or extended manifest

- [ ] New file: `debloat/<vendor>.txt`
- [ ] Extension of an existing file: `debloat/<vendor>.txt`

## Verification

I have personally run this manifest on the device listed above and confirm:

- [ ] All listed packages actually existed on my device before removal
- [ ] All listed packages were removed successfully
- [ ] I rebooted the phone after removal and nothing I use was broken
- [ ] If any package turned out to be essential, I've removed it from the list
- [ ] The first line of the manifest is a `# Verified on: ...` header with the
      device model + Android version

## Dry-run / save-report output

Paste the output of:

```
./scripts/debloat.sh --dry-run --vendor <vendor> --save-report /tmp/debloat.json
```

or attach `/tmp/debloat.json` as a file.

## Additional notes

Anything reviewers should know — packages you deliberately excluded, risky
ones, edge cases, etc.
