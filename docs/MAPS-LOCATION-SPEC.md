# FieldRep OS — Maps, Location & Routing Specification

**Phase:** P0-A5  
**Implementation focus:** P5/P6, with P0/P2 data-model hooks

---

## 1. Purpose

FieldRep OS must support customers with one or more physical locations while remaining independent from a single map vendor.

The application domain owns coordinates, addresses, and customer-location relationships. Map providers supply services such as search, geocoding, routing, and map rendering.

---

## 2. Location Domain Principle

Never model a customer location as only a provider-specific Place ID.

Canonical location data must include provider-independent values such as:

```text
address
latitude
longitude
city/province/district
label/type
```

Provider references are supplemental.

---

## 3. Customer Multi-Location Model

Example:

```text
Dr X
├── Private Office
├── Ghaem Hospital
└── Clinic Y
```

Each location can independently have:

```text
primary status
active status
address
coordinates
source/provenance
provider references
future availability schedule
```

The current Excel `Address` maps to the first imported location where possible.

---

## 4. Core Type Contracts

```ts
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface LocationRecord {
  id: string;
  label: string;
  type?: string;
  country?: string;
  province?: string;
  city?: string;
  district?: string;
  address?: string;
  point?: GeoPoint;
  isPrimary: boolean;
  isActive: boolean;
  source: string;
}
```

---

## 5. Provider Reference

```ts
export interface MapProviderReference {
  provider: string;
  externalId?: string;
  externalType?: string;
  metadata?: Record<string, unknown>;
}
```

These references must not replace FieldRep OS `location.id`.

---

## 6. Map Provider Interface

```ts
export interface MapProvider {
  key: string;

  searchPlaces(input: PlaceSearchInput): Promise<PlaceSearchResult[]>;
  geocode(input: GeocodeInput): Promise<GeocodeResult[]>;
  reverseGeocode(input: ReverseGeocodeInput): Promise<ReverseGeocodeResult>;

  calculateRoute(input: RouteInput): Promise<RouteResult>;
  calculateDistanceMatrix(input: DistanceMatrixInput): Promise<DistanceMatrixResult>;
  optimizeStops(input: OptimizeStopsInput): Promise<OptimizeStopsResult>;

  buildExternalNavigationTarget(input: NavigationTargetInput): Promise<NavigationTarget>;
}
```

Map rendering itself may use a provider-specific UI adapter but should receive domain locations through a provider-neutral model.

---

## 7. Initial Provider Strategy

Initial implementation direction:

```text
Primary Iran-oriented adapter: Neshan
Optional/required-by-company adapter: Google Maps
Future adapters: only through documented/approved provider integration
```

Provider selection can later be configured by workspace/company entitlement/settings.

---

## 8. Provider Selection

Suggested resolver:

```ts
interface MapProviderResolver {
  resolve(workspaceId: string, capability: MapCapability): Promise<MapProvider>;
}
```

This permits:

```text
Workspace A -> Neshan
Workspace B -> Google
```

without changing planner/customer domain code.

---

## 9. Capability Model

A provider may not support every capability.

```ts
export type MapCapability =
  | 'search'
  | 'geocode'
  | 'reverse_geocode'
  | 'map_rendering'
  | 'route'
  | 'distance_matrix'
  | 'optimize_stops'
  | 'external_navigation';
```

Provider resolver/configuration must account for capability availability.

---

## 10. Search

Search inputs may include:

```text
query
near point
city/context
language
limit
```

Search results are candidate locations only. Saving a result creates/updates a FieldRep OS location record after normalization.

Do not store arbitrary full provider payloads indefinitely unless required and permitted.

---

## 11. Geocoding / Reverse Geocoding

Geocoding assists location creation from address.

Reverse geocoding assists:

- User location display
- Visit evidence context
- Manual location confirmation

Provider output must be normalized before entering domain records.

---

## 12. Map View

Map View is a presentation of the current plan/customer set.

Input contract:

```ts
interface MapMarkerModel {
  entityId: string;
  locationId: string;
  point: GeoPoint;
  label: string;
  category: string;
  status?: string;
  sequence?: number;
}
```

Map View must not own plan data.

---

## 13. Planner Map View

P5 planner map view should support:

```text
planned customer pins
selected-day scope
list + map split on desktop
map/list switch or sheet on mobile
visit sequence
route summary
```

Map is on-demand and does not permanently occupy the main Planner screen.

---

## 14. Nearby Customers

Nearby results must always be filtered by user authorization before presentation.

Conceptual service:

```ts
interface NearbyCustomerService {
  findNearby(input: {
    workspaceId: string;
    userId: string;
    point: GeoPoint;
    radiusMeters: number;
    filters?: CustomerFilters;
  }): Promise<NearbyCustomer[]>;
}
```

Current device location must not be sent to unrelated workspaces/providers unnecessarily.

---

## 15. Routing

Routing operates on selected locations, not merely customer identities.

Example:

```text
Dr X / Private Office
Dr Y / Hospital
Pharmacy Z / Branch 2
```

Route result:

```ts
interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  geometry?: unknown;
  legs: RouteLeg[];
  providerMetadata?: Record<string, unknown>;
}
```

Provider geometry is presentation data, not an authoritative business object.

---

## 16. Route Optimization

Route optimization may reorder a set of planned stops.

Important rule:

> Optimization proposes a sequence; it does not silently rewrite an official user plan without confirmation.

Suggested contract:

```ts
interface OptimizeStopsInput {
  start?: GeoPoint;
  stops: Array<{ id: string; point: GeoPoint }>;
  end?: GeoPoint;
  constraints?: Record<string, unknown>;
}

interface OptimizeStopsResult {
  orderedStopIds: string[];
  distanceMeters?: number;
  durationSeconds?: number;
}
```

---

## 17. Doctor Availability — Future Hook

Location can later have availability:

```text
Saturday 17:00–21:00 -> Private Office
Monday 08:00–12:00   -> Hospital
```

Do not bake availability into provider data.

Conceptual model:

```ts
interface LocationAvailabilityWindow {
  locationId: string;
  weekday: number;
  startsAtLocal: string;
  endsAtLocal: string;
  validFrom?: string;
  validUntil?: string;
}
```

This feeds AI scheduling later.

---

## 18. External Navigation

The PWA should be able to launch a navigation target in an external app/browser where supported.

Possible user choices later:

```text
Neshan
Google Maps
other supported installed/navigation targets
```

External navigation is separate from FieldRep OS routing.

---

## 19. Provider Secrets and Gateway

Sensitive API credentials must not be broadly embedded in public PWA JavaScript.

Preferred pattern where provider terms/SDK allow:

```text
PWA
→ FieldRep OS API / map gateway
→ Provider API
```

Some browser-rendering SDKs may require restricted public client keys; these must use provider-supported origin/domain restrictions and separate credentials from server-side services.

No single unrestricted secret should be reused everywhere.

---

## 20. Usage Metering

Because map APIs may have usage-based cost, FieldRep OS should be able to record aggregate provider usage by workspace/company/capability.

Conceptual dimensions:

```text
provider
workspace
capability
request count
billing period
```

This is not required for first visual integration but must be compatible with future quotas/licensing.

---

## 21. Location Edit Provenance

Location changes should record source such as:

```text
platform_master
assigned_dataset
workspace_admin
user_added
user_suggested
provider_geocode
```

A user-added location should not silently overwrite a shared master location.

Future workflow may allow:

```text
user suggestion
→ workspace review
→ workspace-approved location
→ optional platform-master correction suggestion
```

---

## 22. Visit Integration

A planned visit may select a target location.

An actual visit may reference:

```text
planned location
actual selected location
visit location evidence P6
```

Changing actual location should not rewrite the customer's master location.

---

## 23. Visit Verification Interface — P6 Hook

```ts
interface VisitLocationEvidenceInput {
  visitId: string;
  targetLocationId: string;
  capturedPoint: GeoPoint;
  accuracyMeters: number;
  capturedAt: string;
  captureMode: 'online' | 'offline';
}
```

Evaluation is a FieldRep OS domain service, not a map-provider decision.

```ts
interface VisitVerificationService {
  evaluate(input: VisitLocationEvidenceInput): Promise<VisitVerificationResult>;
}
```

Provider may assist with maps/geocoding, but geofence/distance policy remains application-owned.

---

## 24. Verification Result

```ts
interface VisitVerificationResult {
  status: 'verified' | 'nearby' | 'unverified' | 'outside';
  distanceMeters?: number;
  accuracyMeters: number;
  policyRadiusMeters?: number;
  reasons: string[];
}
```

Accuracy must be considered in evaluation.

---

## 25. Privacy/Policy Boundary

Location capabilities are distinct:

```text
customer map data
one-time/current-location nearby search
visit check-in evidence
continuous route tracking
```

They must not be conflated.

Continuous employee tracking is not part of P5/P6 and would require separate feature, permissions, policy, UX, and review.

---

## 26. P0-A5 Acceptance Criteria — Maps

1. Customer location exists independently from provider Place IDs.
2. One customer can have multiple locations.
3. Map provider calls are behind adapters/resolver.
4. Planner Map View consumes the same plan entries as other views.
5. Route optimization cannot silently mutate plan order.
6. Visit verification logic belongs to FieldRep OS, not provider-specific code.
7. Sensitive provider credentials have a gateway/restriction strategy.
8. Future provider replacement does not require rewriting customer/visit domain entities.
