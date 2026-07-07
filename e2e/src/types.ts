export type Platform = "android" | "ios";

export type RatioType = "vtc" | "vti";

export interface ViewRequest {
  platform: Platform;
  ad: string;
  id: string;
}

export interface ClickRequest {
  platform: Platform;
  ad: string;
  id: string;
}

export interface ReadRequest {
  type: RatioType;
  platform: Platform;
  ad: string;
}

export interface WriteResponse {
  message?: string;
}

export interface ReadResponse {
  value: number;
  platform: Platform;
  ad: string;
}

// Config service types, see the OpenAPI spec at http://localhost:8084/
// (source: backend/openapi.yaml) for the authoritative spec.
//
// Note: this type reflects the *contract*, not necessarily what the service
// actually returns. If the runtime response shape disagrees with this type,
// that disagreement is itself worth investigating.

export interface Toasts {
  session_ended: string;
}

export interface UiLayout {
  toasts: Toasts;
}

export interface RetryPolicy {
  max_retries: number;
  backoff_ms: number;
}

export interface ClientConfig {
  platform: Platform;
  ui_layout: UiLayout;
  sample_rate?: number;
  enabled_event_types?: string[];
  retry_policy?: RetryPolicy;
  // Any other fields appearing in the response are not part of the public
  // contract. They are typed as `unknown` rather than excluded so candidates
  // can still inspect them if needed.
  [key: string]: unknown;
}
