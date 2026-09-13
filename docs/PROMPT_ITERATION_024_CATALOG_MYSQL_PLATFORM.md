# PROMPT_ITERATION_024

# Catalog Platform Foundation

# MySQL / Drizzle, Versioned Technical Products,

# Canonical Imports and Professional Product Picker

Continue RoofCalc / CieślaCalc from CURRENT repository HEAD.

Expected starting commit:

cc823db54e8d2ccf455c5c9d90ad515f15957f7e
"023"

This is a strategically important architecture iteration.

RoofCalc now has:

- local calculation engines,
- construction/workbench,
- openings/framing,
- roof build-up,
- quantities,
- roof tiles,
- fixed modular sheets,
- standing seam,
- local project lifecycle.

The next objective is NOT another isolated calculator.

The objective is:

> introduce the versioned product-catalogue platform that future real
> manufacturer products, imports, variants, price lists and backend workflows
> can safely build on.

V24 must prove the end-to-end path:

MySQL catalogue
→ API
→ Product Picker
→ technicalSpecSnapshot
→ EXISTING covering engine

without creating a second calculation path.

================================================== 0. PREFLIGHT AND V23 CLOSEOUT
==================================================

Read fully:

- AGENTS.md
- PROJECT_BLUEPRINT.md
- docs/ROOFCALC_PRODUCT_NORTH_STAR.md
- docs/DOMAIN_RESEARCH_ROADMAP.md
- docs/ARCHITECTURE_COVERING_CATALOG_AND_PRICING_BOUNDARY.md
- ARCHITECTURE V18
- ARCHITECTURE V19
- ARCHITECTURE V20
- ARCHITECTURE V21
- ARCHITECTURE V22
- ARCHITECTURE V23
- PROMPT V23

Inspect current:

- packages/covering-core
- packages/project-core
- packages/calculator-core
- apps/web/src/projects
- CoveringWorkspace / Inspector / MaterialSchedule
- apps/api
- shared contracts
- root workspace/migrations structure

Run:

git status
git log -1 --oneline
git diff
git diff --stat

pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check

Record actual baseline.

IMPORTANT:

The V23 commit contains substantial project lifecycle implementation but
PROJECT_BLUEPRINT appears to have received only its "iteration started"
checkpoint during the interrupted/limited session.

Audit actual V23 source and tests.

Truthfully close V23 in PROJECT_BLUEPRINT before V24 work.

Do not redo working V23 code.

==================================================

1. CLEAN V23 CORE I18N LEAKAGE
   \==================================================

Pure `project-core` currently contains Polish presentation strings such as:

- "Niepoprawny plik JSON."
- "Nieobsługiwany lub uszkodzony format projektu."
- "— kopia"
- "Projekt N"

This violates the architecture rule that pure domain/core packages must not
contain translated user-facing copy.

Refactor cleanly.

Use language-neutral structured codes, e.g.:

invalid-json
unsupported-project-format

or a typed ProjectImportError.

Move presentation messages into web/i18n.

For duplicate/default naming:
either pass the desired name from the application layer,
or expose language-neutral pure helpers that accept a prefix/suffix.

Do NOT put i18next into project-core.

Add regression tests.

================================================== 2. V24 PACKAGE BOUNDARY
==================================================

Create:

packages/catalog-core

This package owns the pure serializable catalogue contracts.

Allowed:

- TypeScript
- Zod
- dependency on covering-core technical schemas if needed

Forbidden:

- React
- DOM
- Express
- Drizzle
- mysql2
- HTTP
- localStorage
- translation
- UI
- pricing calculation.

Do NOT put catalogue entities into covering-core.

covering-core:
knows how a technical covering behaves.

catalog-core:
knows how technical products/revisions/variants are described and transferred.

================================================== 3. CATALOG DOMAIN MODEL
==================================================

Introduce explicit versioned schemas.

At minimum:

Manufacturer
TechnicalProductFamily
TechnicalProductRevision
CommercialVariant

Conceptual:

Manufacturer {
id
slug
name
countryCode?
websiteUrl?
active
}

TechnicalProductFamily {
id
manufacturerId
slug
name
coveringKind
active
}

TechnicalProductRevision {
id
productId
revisionCode
technicalSpec
validFrom?
source
}

CommercialVariant {
id
productId
sku?
name
color?
finish?
metadata?
active
}

Use final names that match the architecture.

================================================== 4. TECHNICAL REVISION IMMUTABILITY
==================================================

CRITICAL INVARIANT:

a technicalRevisionId is immutable.

If revision:

rev-2026-01

already exists with technical spec A,
an importer MUST NOT silently replace it with different technical spec B.

Instead:
reject
or require a NEW revision ID.

This protects reproducibility of saved projects.

Document and test this invariant.

================================================== 5. COVERING TECHNICAL SPEC REUSE
==================================================

TechnicalProductRevision must contain/use the SAME:

CoveringTechnicalSpec

from covering-core.

Do NOT create:

DatabaseRoofTileSpec
ApiRoofTileSpec
CatalogRoofTileSpec

with duplicated fields.

One technical schema.

DB/API/manual path all converge on it.

================================================== 6. CATALOGUE REFERENCE CONTRACT
==================================================

Preserve the existing project contract:

catalogRef {
productId
technicalRevisionId
variantId?
}

technicalSpecSnapshot

Map productId to the stable technical product family ID.

technicalRevisionId maps to immutable TechnicalProductRevision.

variantId maps to optional CommercialVariant.

Do NOT change saved project calculations to require a database lookup.

================================================== 7. DISPLAY SNAPSHOT
==================================================

When selecting a catalogue product, copy useful display facts into:

displaySnapshot

e.g.:

manufacturer
familyName
variantName

This ensures a project remains understandable even when offline.

Do not copy large catalogue records into ProjectDocument.

================================================== 8. MYSQL / DRIZZLE FOUNDATION
==================================================

The Blueprint already targets:

Node
Express
TypeScript
Drizzle ORM
mysql2
MySQL/MariaDB

Implement that foundation now.

Add compatible dependencies:

drizzle-orm
mysql2

and Drizzle migration tooling.

Keep versions compatible with the current Node/TypeScript environment.

Do not introduce Prisma or another ORM in parallel.

================================================== 9. DATABASE LOCATION
==================================================

DB-specific code belongs to backend infrastructure.

Preferred structure:

apps/api/src/db/
client.ts
schema.ts

apps/api/src/catalog/
repository.ts
service.ts
routes.ts

or an equally clean architecture.

Do NOT put Drizzle schemas in catalog-core.

================================================== 10. DATABASE TABLES
==================================================

Implement migrations/tables for at least:

manufacturers

technical_product_families

technical_product_revisions

commercial_variants

catalog_import_batches

Use stable string/UUID IDs.

Include appropriate:

primary keys
foreign keys
unique indexes
search/filter indexes
timestamps
active flags.

Do not store price directly on product tables.

================================================== 11. TECHNICAL SPEC JSON
==================================================

Store technical product revision parameters as validated JSON.

Reason:

different covering kinds have different technical structures.

Pipeline:

DB JSON
↓
coveringTechnicalSpecSchema.parse(...)
↓
typed technical revision

Never trust arbitrary DB JSON.

Do not create 80 nullable columns for every possible roof-covering parameter.

================================================== 12. SOURCE / PROVENANCE
==================================================

Technical revisions should support provenance.

At minimum conceptual fields such as:

sourceUrl?
sourceLabel?
sourceRevision?
sourceHash?
validFrom?

Do not require all fields for manual/admin catalogue data.

The purpose is future technical auditability.

================================================== 13. IMPORT BATCH MODEL
==================================================

Create versioned:

CatalogImportBatchV1

in catalog-core.

It represents CANONICAL data AFTER a source-specific adapter.

Conceptually:

{
schemaVersion: 1
source
manufacturers[]
products[]
revisions[]
variants[]
}

Validate cross references.

Reject duplicates/inconsistent references.

================================================== 14. IMPORT ADAPTER ARCHITECTURE
==================================================

Document and prepare:

Manufacturer XML
Manufacturer XLSX
CSV
JSON
External API
↓
ProviderAdapter
↓
CatalogImportBatchV1
↓
validation
↓
CatalogImporter
↓
repository transaction

Do NOT attempt to write universal XLSX/XML parsing in V24.

Implement the canonical import path first.

Future provider adapters plug into it.

================================================== 15. IMPORT CLI
==================================================

Add a backend CLI command to import canonical catalogue JSON.

Example concept:

pnpm --filter @cieslacalc/api catalog:import ./data/catalog.json --dry-run

pnpm --filter @cieslacalc/api catalog:import ./data/catalog.json --apply

Exact syntax may differ.

Requirements:

default = dry-run / safe

validate first

report:
manufacturers
products
revisions
variants
new
unchanged
conflicts

apply inside a DB transaction.

No partial import after validation failure.

================================================== 16. IDEMPOTENT IMPORT
==================================================

Running the SAME import twice must not duplicate data.

Existing identical immutable revision:
unchanged.

Same revision ID with different spec:
CONFLICT.

Commercial variant may be updated only according to an explicit safe rule.

Document the rule.

================================================== 17. IMPORT BATCH AUDIT
==================================================

Store import batch metadata:

id
source
checksum
startedAt
completedAt
status
counts
error summary where useful.

Do not store raw huge uploaded files in MySQL unless justified.

================================================== 18. DO NOT EXPOSE PUBLIC WRITE API
==================================================

V24 has no authentication yet.

Therefore:

catalogue REST API = READ ONLY.

Do NOT expose anonymous:

POST product
PUT product
DELETE product
POST import

routes.

Mutation happens through the controlled CLI for now.

This avoids creating an insecure admin API.

================================================== 19. CATALOG REPOSITORY ABSTRACTION
==================================================

Backend service code should depend on an interface, not directly on Drizzle
queries everywhere.

Conceptually:

CatalogRepository {
listManufacturers(...)
searchProducts(...)
getProduct(...)
getRevision(...)
listVariants(...)
}

DrizzleCatalogRepository implements it.

API tests should be able to use MemoryCatalogRepository/fakes without MySQL.

================================================== 20. API ROUTES
==================================================

Add read-only endpoints.

Suggested contract:

GET /api/catalog/manufacturers

GET /api/catalog/products
?q=
&kind=
&manufacturerId=
&limit=
&cursor=

GET /api/catalog/products/:productId

GET /api/catalog/products/:productId/revisions/:revisionId

Exact route composition may be improved if a cleaner REST model emerges.

Validate query params with Zod.

================================================== 21. PRODUCT SEARCH RESPONSE
==================================================

List endpoint should return summaries only.

Do not send huge technical JSON for every search result if unnecessary.

Summary should contain enough UI data:

product ID
manufacturer
family name
kind
current revision ID
key technical preview fields where useful
available variant count

Detail endpoint supplies the full validated technical revision.

================================================== 22. PAGINATION
==================================================

Prepare catalogue search for hundreds/thousands of products.

Do NOT return every product.

Implement deterministic pagination.

Cursor pagination is preferred if clean;
limit/offset acceptable for V24 if documented.

Set sane limits.

================================================== 23. API ERROR CONTRACT
==================================================

Use structured API errors.

Conceptually:

{
error: {
code: "catalog-product-not-found",
message?: ...
}
}

Prefer stable codes.

Do not force Polish messages into API domain contracts.

Web translates codes.

================================================== 24. DATABASE OPTIONALITY
==================================================

The calculator must remain usable without MySQL/API.

Existing saved projects:
fully calculate locally.

Manual technical product path:
continues to work.

When DB is not configured:
catalog endpoints may return controlled 503 / unavailable.

The web must not crash.

================================================== 25. CONFIGURATION
==================================================

Use environment configuration.

Example:

DATABASE_URL

or explicit MySQL variables if the project architecture prefers them.

Add:

.env.example

with NO real credentials.

Do not commit passwords.

================================================== 26. DEVELOPMENT WITHOUT MYSQL
==================================================

Automated unit/API tests must NOT require a developer to run a real MySQL
instance.

Use:

repository fakes
service tests
route tests.

DB integration tests may be separately gated behind an environment variable if
useful.

Do not make normal `pnpm test` depend on external infrastructure.

================================================== 27. MIGRATIONS
==================================================

Create deterministic SQL/Drizzle migrations.

Do not use automatic schema synchronization in production.

Document:

generate
apply
rollback/recovery policy.

Do not depend on Docker.

================================================== 28. WEB REMOTE-STATE BOUNDARY
==================================================

Catalogue data is SERVER STATE.

Use TanStack Query for:

manufacturer list
product search
product detail
variants

if introducing it cleanly fits the current web architecture.

Do NOT copy catalogue server state into Zustand.

Zustand remains for local editing/workbench state.

This follows the Blueprint architecture.

================================================== 29. WEB CATALOG CLIENT
==================================================

Create a typed client boundary.

Conceptually:

CatalogClient {
listManufacturers()
searchProducts(query)
getProduct(id)
}

Do not scatter raw fetch calls through React components.

Parse API responses with Zod/shared contracts where practical.

================================================== 30. CATALOG PRODUCT PICKER UX
==================================================

Create a professional lazy-loaded product picker for Covering.

Do NOT add a permanent fourth panel.

Flow:

Dodaj pokrycie
↓
choose covering kind
↓
[ Z katalogu ] [ Parametry ręczne ]

Catalogue opens a dialog/sheet.

Desktop:
focused modal/dialog.

Mobile:
reuse established sheet UX.

================================================== 31. PRODUCT PICKER SEARCH
==================================================

Catalogue picker:

search input

manufacturer filter

covering kind filter

results

Keep it fast and scan-friendly.

Avoid giant tables.

Example card:

Manufacturer
Product family

Dachówka ceramiczna

Szerokość krycia: ...
Rozstaw łat: ...
Min. kąt: ...

[ Wybierz ]

Only show values that can be derived generically and truthfully.

================================================== 32. PRODUCT KIND FILTER
==================================================

When adding:

Dachówka

catalogue defaults filter:
roof-tile.

Blacha modułowa:
modular-sheet.

Rąbek:
standing-seam.

Do not allow accidental selection of an incompatible covering kind unless the
user explicitly changes the operation.

================================================== 33. PRODUCT DETAIL / REVISION
==================================================

Before Apply show:

manufacturer
family
technical revision
technical source if available
technical parameters
available variants

If multiple installation modes exist:
allow choosing the appropriate mode after/before applying as appropriate.

Do not hide critical range/pitch facts.

================================================== 34. SELECTING CATALOG PRODUCT
==================================================

On Apply:

fetch/validate the exact technical revision.

Create/update CoveringProductSelection:

catalogRef {
productId
technicalRevisionId
variantId?
}

displaySnapshot

technicalSpecSnapshot

The EXISTING Tile/Sheet/StandingSeam engines consume it unchanged.

There must be ZERO catalogue-specific calculation code.

================================================== 35. SNAPSHOT REPRODUCIBILITY TEST
==================================================

Test explicitly:

1. select revision R1,
2. project stores R1 technical snapshot,
3. catalogue current revision becomes R2,
4. existing project still calculates with R1.

This is a critical product invariant.

================================================== 36. NO AUTOMATIC CATALOG REFRESH
==================================================

Do NOT automatically upgrade old projects to latest revision.

Architecture may detect:

newer revision available

but V24 does not need a full update workflow.

If implemented:
show informational state only.

No silent geometry change.

================================================== 37. MANUAL PRODUCT PATH REMAINS FIRST-CLASS
==================================================

Do not turn manual parameters into a hidden/debug option.

Users must be able to use RoofCalc:

without catalogue
with custom/local product
offline.

Both paths enter the same engines.

================================================== 38. CURRENT PROJECTS + CATALOG
==================================================

Catalog connectivity must not interfere with V23 autosave.

Selecting a catalogue product is a normal canonical project edit.

Expected:

select catalogue product
→ one ProjectDocument edit
→ project dirty
→ autosave
→ saved locally.

Opening a saved project must NOT fetch catalog just to calculate it.

================================================== 39. UI SOURCE BADGES
==================================================

In Covering Inspector show concise source information.

Examples:

Katalog
BMI · Celtycka
rewizja 2026-01

or:

Parametry ręczne

Do not clutter the canvas.

================================================== 40. COVERING ASSIGNMENT CREATION UX
==================================================

Polish the current:

- Dachówka
- Blacha modułowa
- Rąbek

flow.

Prefer a single:

- Dodaj pokrycie

which opens a compact type/source chooser,
if this improves clarity without a large rewrite.

Do not make three growing rows of buttons if future covering types are added.

================================================== 41. MOBILE UX
==================================================

At 360–430 px:

catalogue picker is a single dominant sheet.

Search field remains visible.

Filters remain reachable.

Result card touch targets >= ~44px.

Opening product details must not stack another competing large sheet.

Back:
detail → results → close

must be predictable.

No horizontal overflow.

================================================== 42. LOADING / EMPTY / ERROR STATES
==================================================

Professional UX requires explicit states.

Loading:
skeleton/compact loading.

No results:
clear empty message.

API unavailable:
"Catalog currently unavailable" +
manual product CTA.

Do not show raw network errors.

Do not block existing project editing.

================================================== 43. INITIAL DATA
==================================================

Do NOT pretend to ship a complete manufacturer catalogue in V24.

Add a small DEMO/TEST canonical catalogue dataset sufficient to prove:

roof tile
fixed modular sheet
standing seam

through the real DB/API/picker path.

Clearly label fixtures/demo data.

Do not present research fixtures as an authoritative production catalogue.

================================================== 44. FUTURE PRICE ARCHITECTURE
==================================================

Do NOT add `price` fields to technical product schemas.

Create/update architecture documentation for future:

PriceList
PriceListEntry

referencing:

CommercialVariant
sale unit
currency
validFrom / validTo
net amount

Keep:

Technical catalogue
and
Commercial pricing

separate.

Do not implement Cost Engine in V24.

================================================== 45. FUTURE IMPORTS
==================================================

Document adapter examples:

KoramicXlsxAdapter
BmiXmlAdapter
BudmatCsvAdapter
RuukkiApiAdapter

ONLY as conceptual future adapters.

Do not hard-code manufacturer names into shared importer logic.

Provider adapter output is always:

CatalogImportBatchV1.

================================================== 46. SECURITY
==================================================

Validate:

query limits
IDs
JSON payloads
DB JSON technical specs.

Parameterize all database operations through Drizzle.

Do not concatenate SQL strings from requests.

No public mutations.

Do not expose environment/database errors to frontend.

================================================== 47. INDEXES
==================================================

Create useful MySQL indexes for:

manufacturer
covering kind
slug
active
current revision lookup
SKU
searchable family name where practical.

Do not over-index blindly.

================================================== 48. OBSERVABILITY
==================================================

Keep logging minimal but structured.

Import CLI should report:

batch ID
counts
conflicts
errors

API must not spam console for normal 404/search misses.

No external logging platform required.

================================================== 49. PERFORMANCE
==================================================

Product picker should debounce search.

Avoid request-per-keystroke without debounce/cancellation.

Use query caching.

Do not load technical detail for every search card.

Lazy-load catalogue picker.

Record bundle effect.

================================================== 50. TESTS — CATALOG CORE
==================================================

At minimum:

- manufacturer parse,
- technical product parse,
- each covering kind revision,
- variant parse,
- import batch parse,
- broken references rejected,
- duplicate IDs rejected,
- immutable revision conflict detection,
- identical re-import unchanged,
- catalogRef mapping,
- no price field in technical revision.

================================================== 51. TESTS — API SERVICE
==================================================

Using memory/fake repository:

- manufacturers,
- search by query,
- filter kind,
- filter manufacturer,
- pagination,
- product detail,
- revision detail,
- missing entity,
- invalid query,
- stable error codes.

Normal API tests require NO MySQL.

================================================== 52. TESTS — IMPORTER
==================================================

Test:

- dry-run changes nothing,
- apply valid batch,
- second apply idempotent,
- same revision/same spec unchanged,
- same revision/different spec conflict,
- transaction failure leaves no partial batch,
- invalid reference rejected before writes.

================================================== 53. TESTS — DB CONTRACT
==================================================

Test schema/migration expectations without requiring production DB.

If optional integration DB test infrastructure is added:
gate it explicitly.

Do not slow normal unit suite with external MySQL.

================================================== 54. TESTS — WEB
==================================================

Add:

- picker opens,
- manual path remains,
- filters,
- search,
- loading,
- empty,
- API failure + manual fallback,
- product detail,
- variant selection,
- apply catalogue product,
- correct catalogRef,
- correct technical snapshot,
- existing engine resolves chosen product,
- one canonical history edit,
- V23 autosave persists it,
- reopen project calculates with snapshot without catalogue call,
- mobile flow.

================================================== 55. V23 PROJECT MANAGER REGRESSION
==================================================

Verify:

new
rename
duplicate
delete
autosave
restore
import/export

remain green.

Catalogue work must not break project lifecycle.

================================================== 56. LIVE BROWSER QA
==================================================

If browser is available test:

desktop 1440×900
1024
768
430×932
390×844
360×800

Flows:

create project
add roof tile from catalogue
save/autosave
reload project
turn API unavailable
existing roof still calculates
manual product still works.

Also test:
modular sheet
standing seam.

Do not claim QA if browser unavailable.

================================================== 57. ARCHITECTURE DOCUMENTS
==================================================

Create:

docs/ARCHITECTURE_V24_CATALOG_MYSQL_PLATFORM.md

Document:

catalog-core boundary
DB adapter
technical revision immutability
variants
imports
REST
snapshot flow
offline behavior
TanStack Query
security
future prices
future provider adapters.

Create:

docs/PROMPT_ITERATION_024_CATALOG_MYSQL_PLATFORM.md

containing this actual contract.

================================================== 58. IMPORTANT NON-GOALS
==================================================

Do NOT implement in V24:

authentication
user accounts
cloud project sync
public catalogue write admin
complete manufacturer catalogue
web scraping
automatic manufacturer imports
Cost Engine
price calculations
VAT
discount
purchase optimization
cut-to-length sheet solver
PDF/XLSX
billing/payments
team collaboration.

================================================== 59. FINAL VALIDATION
==================================================

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check

Run changed-file Prettier validation.

Run/import CLI dry-run fixture if implemented.

Record exact:

tests/files
web bundle
API bundle
catalog picker chunk
warnings
DB/migration status
live QA status.

================================================== 60. PROJECT BLUEPRINT
==================================================

Truthfully close V23 first.

Then record V24.

Include:

catalog architecture
DB tables
migration
import pipeline
REST routes
picker
snapshot proof
manual fallback
offline behavior
tests
bundle impact
known limitations.

NEXT ACTION should likely be:

Iteration 025 — cut-to-length metal covering strategy using the V22
variable-panel kernel and V24 catalogue product path,

unless user review prioritizes Price Lists / Cost Engine first.

Do not begin V25 automatically.

Do not commit or push unless explicitly requested.
