# Pipeline bot API

For an agent that creates and updates Beo OS leads, quotes, deals, payments, and retainers. The live path is the Fastify server, not the Cloud Function. New columns written through the Cloud Function are dropped.

Base URL in production is the Beo OS API host. Locally it is `http://127.0.0.1:8787`.

## Auth

Every route below expects the bot key:

```http
X-Hub-Api-Key: $BOT_API_KEY
```

`Authorization: Bearer $BOT_API_KEY` is also accepted. The key is the server env `BOT_API_KEY`. It is not a Supabase user JWT.

Writes take an actor so stage history can record who did it:

```json
{ "actor": { "userId": "<profiles.id>", "userName": "Johnny" }, "data": {} }
```

`userId` must be a `profiles.id`. Lead create requires it, and requires `ownerId` in `data`.

## Endpoints

| Action | Request |
| --- | --- |
| Catalog | `GET /api/bot-data?meta=schema` |
| List or filter | `GET /api/bot-data?entity=<name>` |
| Create | `POST /api/bot-data?entity=<name>` |
| Update | `PATCH /api/bot-data?entity=<name>&id=<uuid>` |
| Change a lead or deal stage | `POST /api/bot-data?entity=leads\|deals&id=<uuid>&sub=stage` |
| Append a lead note | `POST /api/bot-data?entity=leads&id=<uuid>&sub=activity` |
| Pipeline summary | `GET /api/pipeline/summary` or `GET /api/bot-data?entity=pipeline` |
| Public intake | `POST /api/intake/lead` with `X-Intake-Secret` |

Entity names: `leads`, `quotes`, `deals`, `dealpayments` (or `deal_payments`), `recurringcharges` (or `recurring_charges`). History is read-only: `leadstagehistory`, `dealstagehistory`.

Filters (query string): `status`, `stage`, `source`, `ownerId`, `leadId`, `dealId`, `temperature`, `kind`, `dueFrom`, `dueTo`. On leads, `stage` filters `status`. On payments, `dueFrom` / `dueTo` filter `due_date`. On retainers they filter `next_due`.

List response:

```json
{ "ok": true, "entity": "leads", "count": 1, "limit": 100, "items": [] }
```

Create response:

```json
{ "ok": true, "entity": "leads", "id": "<uuid>", "collection": "leads" }
```

## Stages and default probability

A lead with its own `probability` (0–100) uses that number. A missing probability is not 100%. The stage default is used. Weighted totals are an estimate. In the UI the label is **הערכה**. In the summary JSON, `weightedIsEstimate` is `true` and `estimateLabel` is `הערכה`.

| Stage | Where | Default % |
| --- | --- | --- |
| `new` | lead | 10 |
| `contacted` | lead | 15 |
| `follow_up` | lead | 20 |
| `replied` | lead | 25 |
| `meeting_scheduled` | lead | 35 |
| `specification` | lead | 45 |
| `quote_sent` | lead | 50 |
| `negotiation` | lead | 70 |
| `signed`, `deposit_paid`, `in_progress`, `delivered`, `paid_in_full` | deal | 100 |
| `lost`, `not_relevant`, `no_answer`, `nurture`, `cold`, `cancelled` | lead or deal | 0 |

Lead statuses that are not a deal: `closed` is a converted lead and is left off the board. Setting a lead to `lost` requires `lostReason`: `price`, `timing`, `no_reply`, `chose_competitor`, `not_fit`, or `other`.

Deal stages, in order: `signed` → `deposit_paid` → `in_progress` → `delivered` → `paid_in_full`. `cancelled` leaves the open board. `deals.status` stays `active`, `completed`, or `cancelled` for commission. Do not send `status` when you mean the delivery stage; send `stage`.

Preferred `source` values (free text is still stored): `meta_ads`, `google_ads`, `organic_seo`, `whatsapp`, `cold_email`, `facebook_groups`, `referral`, `phone`, `manual`, `other`.

## Create a lead

```http
POST /api/bot-data?entity=leads
```

```json
{
  "actor": { "userId": "<profiles.id>" },
  "data": {
    "name": "נועה פרסום",
    "ownerId": "<profiles.id>",
    "status": "new",
    "source": "google_ads",
    "sourceDetail": "campaign-a",
    "phone": "0509990001",
    "email": "noa@example.test",
    "estimatedValue": 5000,
    "temperature": "warm",
    "nextAction": "להתקשר",
    "nextActionAt": "2026-10-21T08:00:00+03:00"
  }
}
```

Move the stage (this writes `lead_stage_history`):

```http
POST /api/bot-data?entity=leads&id=<leadId>&sub=stage
```

```json
{ "actor": { "userId": "<profiles.id>" }, "data": { "status": "replied" } }
```

`status: "replied"` also sets `repliedAt` when it was empty.

## Create a quote

```http
POST /api/bot-data?entity=quotes
```

```json
{
  "actor": { "userId": "<profiles.id>" },
  "data": {
    "leadId": "<leadId>",
    "title": "אתר תדמית",
    "amountPreVat": 4500,
    "vatIncluded": false,
    "period": "one_time",
    "status": "sent",
    "slug": "example-site",
    "validUntil": "2026-11-20"
  }
}
```

`period` is `one_time`, `monthly`, or `yearly`. `status` is `draft`, `sent`, `viewed`, `accepted`, `rejected`, or `expired`. Omit `number` and the server allocates `BEO-YYYY-NNN` from `next_quote_number()`. That counter does not scan existing rows, so do not insert quote numbers yourself. `url` defaults to `https://beo-offer.pages.dev/offer/<slug>`.

One lead can have several quotes. When `estimatedValue` is empty, the face amount is the newest quote that is not `rejected` or `expired`.

## Create a deal and record the signing date

```http
POST /api/bot-data?entity=deals
```

```json
{
  "actor": { "userId": "<profiles.id>" },
  "data": {
    "clientId": "<clientId>",
    "leadId": "<leadId>",
    "title": "אתר תדמית",
    "dealKind": "one_time",
    "amountTotal": 4500,
    "stage": "signed",
    "commissionPercent": 0
  }
}
```

`dealKind` is `one_time`, `retainer_monthly`, or `retainer_yearly`. `clientId` and `title` are required. `commissionPercent` defaults to 0.

`signed_at` is set when the deal enters `signed`. It is not copied from `created_at`. Later stages keep that timestamp. **נחתם החודש** counts deals whose `signed_at` falls in the current month in Asia/Jerusalem, and skips cancelled deals and deals whose lead status is `lost`.

Move a deal:

```http
POST /api/bot-data?entity=deals&id=<dealId>&sub=stage
```

```json
{ "actor": { "userId": "<profiles.id>" }, "data": { "stage": "deposit_paid" } }
```

`deposit_paid` stamps `depositPaidAt` when empty. `delivered` stamps `deliveredAt`. `paid_in_full` sets `status` to `completed` and stamps `paidInFullAt`. `cancelled` sets `status` to `cancelled`.

## Record a payment

Payments are rows in `deal_payments`, not a change of deal stage. A paid deposit does not by itself move the deal to `deposit_paid`; send `sub=stage` when the stage should change.

```http
POST /api/bot-data?entity=dealpayments
```

```json
{
  "actor": { "userId": "<profiles.id>" },
  "data": {
    "dealId": "<dealId>",
    "clientId": "<clientId>",
    "amount": 1500,
    "kind": "deposit",
    "status": "paid",
    "dueDate": "2026-10-20",
    "paidAt": "2026-10-20T12:00:00+03:00"
  }
}
```

`kind` is `deposit`, `milestone`, `installment`, `retainer`, or `hosting`. `status` is `scheduled`, `invoiced`, `paid`, or `overdue`.

**נגבה החודש** sums rows with `status: "paid"` and `paidAt` in the current month (Asia/Jerusalem). A paid row with no `paidAt` is not included. Marking a row paid:

```http
PATCH /api/bot-data?entity=dealpayments&id=<paymentId>
```

```json
{
  "actor": { "userId": "<profiles.id>" },
  "data": { "status": "paid", "paidAt": "2026-10-20T12:00:00+03:00" }
}
```

`invoiceId` can point at an existing invoice. This API does not issue a Green Invoice / Morning document.

List what is still open:

```http
GET /api/bot-data?entity=dealpayments&dealId=<dealId>&status=scheduled
GET /api/bot-data?entity=dealpayments&dueFrom=2026-10-01&dueTo=2026-10-31
```

## Record a retainer

A retainer is a `recurring_charges` row. It is monthly revenue, not a one-off payment. When a cycle is actually collected, also add a `dealpayments` row with `kind: "retainer"` and `status: "paid"`.

```http
POST /api/bot-data?entity=recurringcharges
```

```json
{
  "actor": { "userId": "<profiles.id>" },
  "data": {
    "dealId": "<dealId>",
    "clientId": "<clientId>",
    "title": "ריטיינר תוכן",
    "amount": 1800,
    "interval": "monthly",
    "kind": "retainer",
    "startDate": "2026-10-01",
    "nextDue": "2026-11-01"
  }
}
```

`interval` is `monthly` or `yearly`. `kind` is `retainer` or `hosting`. Omit `active` and it stays on. Pause with `PATCH` and `"active": false`.

The summary `mrr` is active monthly amounts, plus yearly amounts divided by 12. Rows that have not started, or that already ended, are left out.

## Pipeline summary

```http
GET /api/pipeline/summary
```

```json
{
  "ok": true,
  "summary": {
    "currency": "ILS",
    "asOf": "2026-10-20",
    "estimateLabel": "הערכה",
    "weightedIsEstimate": true,
    "openPipelineAmount": 88900,
    "openPipelineWeighted": 55800,
    "openCount": 11,
    "stages": [
      {
        "stage": "new",
        "label": "ליד חדש",
        "count": 1,
        "amount": 10000,
        "weightedAmount": 1000,
        "weightedIsEstimate": true,
        "countsTowardOpen": true
      }
    ],
    "wonThisMonth": { "count": 4, "amount": 26500 },
    "collectedThisMonth": { "count": 2, "amount": 5500 },
    "overduePayments": { "count": 1, "amount": 1500 },
    "mrr": 2700,
    "followUpsDue": { "count": 2, "items": [] },
    "leadsBySourceThisWeek": [{ "source": "meta_ads", "count": 1 }],
    "conversionBySource": []
  }
}
```

`openPipelineAmount` and each stage’s `amount` are the plain ₪ total. `openPipelineWeighted` and `weightedAmount` are the estimate. Do not present the estimate as money already won or collected.

`wonThisMonth` uses `signed_at`, not `created_at`. `collectedThisMonth` is payments actually paid this month. `asOf` is today in Asia/Jerusalem. Lost leads and cancelled deals stay out of the open total and out of `wonThisMonth`. `paid_in_full` is visible and is not part of the open total.

## Public intake

Forms, Make, Meta, and Google post here. This is separate from the bot key.

```http
POST /api/intake/lead
X-Intake-Secret: <INTAKE_WEBHOOK_SECRET, or the source's secret from INTAKE_SOURCE_SECRETS>
```

```json
{ "source": "meta_ads", "name": "דנה", "phone": "0501234567", "email": "dana@example.test" }
```

`source` must be one of the preferred values above. The same phone, email, or domain attaches a note to the existing lead instead of inserting a second row. The owner is `ownerId` or, if omitted, `DEFAULT_LEAD_OWNER_ID` (Or’s `profiles.id`, set at deploy). A first-contact task is due `LEAD_CONTACT_WITHIN_HOURS` later (default 4).
