# UI primitives

Mounted once via `UiProviders` in `app/layout.tsx` (admin, portal, login, intake all get them).
**Rule: no `window.alert` / `window.confirm`. Use `useToast` / `useConfirm`.**

```tsx
import { Modal } from "@/components/ui/modal";
<Modal open={open} onClose={close} title="Edit recipe" size="lg" dirty={isDirty}
  footer={<><button onClick={close}>Cancel</button><button type="submit" form="f">Save</button></>}>
  <form id="f">...</form>
</Modal>
// variant="sheet" -> bottom sheet on mobile (portal). dirty -> asks "Discard unsaved changes?".
// Nested Modals are fine; only the top-most handles Escape / Tab.

import { useConfirm, useAlert } from "@/components/ui/confirm-dialog";
const confirm = useConfirm();
if (!(await confirm({ title: "Delete recipe?", message: "This cannot be undone.",
  confirmLabel: "Delete", tone: "danger" }))) return;
const alertDialog = useAlert(); await alertDialog({ title: "Heads up", message: "..." }); // rare

import { useToast } from "@/components/ui/toast";
const toast = useToast();
toast.success("Saved");
toast.error("Could not save", { action: { label: "Retry", onClick: save } });
toast.info("Copied", { duration: 3000 }); // duration 0 = sticky

import { IconButton } from "@/components/ui/icon-button";
<IconButton label="Delete ingredient" tone="danger" onClick={del}><Trash2 size={16} /></IconButton>
// tone: default | danger | primary; 40px touch target on mobile, 32px on md+.
```

## Formatters (`lib/format.ts`, pure)

```ts
formatLei(12.5) // "12,50 lei"      formatNumber(1234.5, 1) // "1.234,5"
formatPricePerUnit(0.0084, "g") // "8,40 lei/kg"  (ml -> lei/l, buc -> lei/buc)
parseDecimal("12,5") // 12.5  (null if invalid)
formatDate("2026-10-19") // "19 Oct 2026"   formatShortDate(d) // "Mon 19 Oct"
formatWeekRange("2026-10-19") // "19–25 Oct 2026"   formatDateTime(ts) // "19 Oct 2026, 14:05"
toLocalISODate(date) // 'YYYY-MM-DD' (local; NEVER use toISOString().slice(0,10))
parseLocalDate, mondayOf, addDays(iso, n), currentWeekStart(), nextWeekStart(), isMonday(iso)
```

Date inputs accept a `Date` or `'YYYY-MM-DD'`; strings are parsed as LOCAL dates.

## Z-index scale

| Layer | z |
|-------|---|
| Sticky headers / bottom tabs | z-10 – z-30 |
| Sidebar overlay (mobile) | z-40 |
| Modal | z-50 |
| Confirm / alert dialog | z-[60] |
| Toasts | z-[70] |

Never use z-index above 50 for page content; popovers inside a modal should be `absolute` within it.
