use std::{collections::VecDeque, sync::Arc};

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{Method, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, Semaphore};
use tower_http::cors::{Any, CorsLayer};

use crate::{ScanReport, app::ScannerSettings};

const HISTORY_CAP: usize = 100;

#[derive(Clone)]
pub struct ApiState {
    settings: ScannerSettings,
    history: Arc<Mutex<VecDeque<ScanReport>>>,
    scan_lock: Arc<Semaphore>,
}

impl ApiState {
    #[must_use]
    pub fn new(settings: ScannerSettings) -> Self {
        Self {
            settings,
            history: Arc::new(Mutex::new(VecDeque::new())),
            scan_lock: Arc::new(Semaphore::new(1)),
        }
    }
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    read_only: bool,
    scan_in_progress: bool,
    history_count: usize,
    latest_observed_at_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
struct ConfigResponse {
    defaults: ScannerSettings,
    providers: [&'static str; 2],
    history_retention: &'static str,
}

#[derive(Debug, Default, Deserialize)]
pub struct ScanRequest {
    pub amount_in: Option<String>,
    pub gas_cost: Option<String>,
    pub min_profit_bps: Option<String>,
    pub timeout_ms: Option<u64>,
    pub retries: Option<u32>,
    pub cetus_sources: Option<Vec<String>>,
    pub seven_k_sources: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct HistoryQuery {
    limit: Option<usize>,
}

#[derive(Debug, Serialize)]
struct HistoryResponse {
    reports: Vec<ScanReport>,
    retention: &'static str,
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    code: &'static str,
    message: String,
}

#[derive(Debug)]
struct ApiError(StatusCode, &'static str, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.0,
            Json(ErrorBody {
                code: self.1,
                message: self.2,
            }),
        )
            .into_response()
    }
}

pub fn router(state: ApiState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/config", get(config))
        .route("/api/scans", get(history).post(run_scan))
        .route("/api/scans/latest", get(latest))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_headers(Any)
                .allow_methods([Method::GET, Method::POST]),
        )
        .with_state(state)
}

async fn health(State(state): State<ApiState>) -> Json<HealthResponse> {
    let history = state.history.lock().await;
    Json(HealthResponse {
        status: "ok",
        read_only: true,
        scan_in_progress: state.scan_lock.available_permits() == 0,
        history_count: history.len(),
        latest_observed_at_ms: history.front().map(|report| report.observed_at_ms),
    })
}

async fn config(State(state): State<ApiState>) -> Json<ConfigResponse> {
    Json(ConfigResponse {
        defaults: state.settings,
        providers: ["cetus", "seven_k"],
        history_retention: "memory_only_100_reports",
    })
}

async fn latest(State(state): State<ApiState>) -> Result<Json<ScanReport>, ApiError> {
    state
        .history
        .lock()
        .await
        .front()
        .cloned()
        .map(Json)
        .ok_or(ApiError(
            StatusCode::NOT_FOUND,
            "no_scan_history",
            "No scan has completed since service start.".to_owned(),
        ))
}

async fn history(
    State(state): State<ApiState>,
    Query(query): Query<HistoryQuery>,
) -> Json<HistoryResponse> {
    let limit = query.limit.unwrap_or(20).clamp(1, HISTORY_CAP);
    let reports = state
        .history
        .lock()
        .await
        .iter()
        .take(limit)
        .cloned()
        .collect();
    Json(HistoryResponse {
        reports,
        retention: "memory_only_100_reports",
    })
}

async fn run_scan(
    State(state): State<ApiState>,
    Json(request): Json<ScanRequest>,
) -> Result<Json<ScanReport>, ApiError> {
    let permit = state.scan_lock.clone().try_acquire_owned().map_err(|_| {
        ApiError(
            StatusCode::CONFLICT,
            "scan_in_progress",
            "Another scan is already running.".to_owned(),
        )
    })?;
    let settings = apply_request(state.settings.clone(), request)?;
    let scanner = settings.scanner().map_err(|error| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_settings",
            error.to_string(),
        )
    })?;
    let report = scanner
        .scan()
        .await
        .map_err(|error| ApiError(StatusCode::BAD_GATEWAY, "scan_failed", error.to_string()))?;
    drop(permit);

    if !report.has_complete_round_trip() {
        let message = report
            .failures
            .first()
            .map(|failure| failure.message.clone())
            .unwrap_or_else(|| "Providers returned no complete round trip.".to_owned());
        return Err(ApiError(
            StatusCode::BAD_GATEWAY,
            "no_complete_round_trip",
            message,
        ));
    }

    let mut history = state.history.lock().await;
    history.push_front(report.clone());
    history.truncate(HISTORY_CAP);
    Ok(Json(report))
}

fn apply_request(
    mut settings: ScannerSettings,
    request: ScanRequest,
) -> Result<ScannerSettings, ApiError> {
    if let Some(value) = request.amount_in {
        settings.amount_in = parse(&value, "amount_in")?;
    }
    if let Some(value) = request.gas_cost {
        settings.gas_cost = parse(&value, "gas_cost")?;
    }
    if let Some(value) = request.min_profit_bps {
        settings.min_profit_bps = parse(&value, "min_profit_bps")?;
    }
    if let Some(value) = request.timeout_ms {
        settings.timeout_ms = value;
    }
    if let Some(value) = request.retries {
        settings.retries = value;
    }
    if let Some(value) = request.cetus_sources {
        settings.cetus_sources = clean_sources(value);
    }
    if let Some(value) = request.seven_k_sources {
        settings.seven_k_sources = clean_sources(value);
    }
    settings
        .validate()
        .map_err(|message| ApiError(StatusCode::BAD_REQUEST, "invalid_settings", message))?;
    Ok(settings)
}

fn parse<T: std::str::FromStr>(value: &str, field: &'static str) -> Result<T, ApiError> {
    value.parse().map_err(|_| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_settings",
            format!("{field} must be a base-10 integer"),
        )
    })
}

fn clean_sources(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use super::*;

    #[tokio::test]
    async fn health_declares_read_only_boundary() {
        let response = router(ApiState::new(ScannerSettings::default()))
            .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["read_only"], true);
        assert_eq!(json["history_count"], 0);
    }

    #[tokio::test]
    async fn latest_is_typed_when_history_is_empty() {
        let response = router(ApiState::new(ScannerSettings::default()))
            .oneshot(
                Request::get("/api/scans/latest")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["code"], "no_scan_history");
    }

    #[test]
    fn request_validation_preserves_decimal_strings() {
        let settings = apply_request(
            ScannerSettings::default(),
            ScanRequest {
                amount_in: Some("12345678901234567890".to_owned()),
                gas_cost: Some("7".to_owned()),
                ..ScanRequest::default()
            },
        )
        .unwrap();
        assert_eq!(settings.amount_in, 12_345_678_901_234_567_890);
        assert_eq!(settings.gas_cost, 7);
    }
}
