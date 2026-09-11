use std::{
    collections::{BTreeSet, VecDeque},
    path::PathBuf,
    sync::Arc,
};

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

use crate::{
    ResearchReport, ScanReport,
    app::ScannerSettings,
    cartography::{CartographyReport, build_cartography},
    http::now_ms,
    journal::{JournalError, ResearchJournal},
    research::{
        CONFIRMATION_RUNS, DEFAULT_AMOUNTS, DEFAULT_MARKETS, MAX_AMOUNTS, MAX_MARKETS,
        MIN_CONFIRMATIONS, confirm_opportunities,
    },
};

const HISTORY_CAP: usize = 100;
const RESEARCH_HISTORY_CAP: usize = 250;

#[derive(Clone)]
pub struct ApiState {
    settings: ScannerSettings,
    history: Arc<Mutex<VecDeque<ScanReport>>>,
    research_history: Arc<Mutex<VecDeque<ResearchReport>>>,
    scan_lock: Arc<Semaphore>,
    journal: Option<ResearchJournal>,
    journal_rejected_lines: usize,
}

impl ApiState {
    #[must_use]
    pub fn new(settings: ScannerSettings) -> Self {
        Self {
            settings,
            history: Arc::new(Mutex::new(VecDeque::new())),
            research_history: Arc::new(Mutex::new(VecDeque::new())),
            scan_lock: Arc::new(Semaphore::new(1)),
            journal: None,
            journal_rejected_lines: 0,
        }
    }

    pub fn persistent(settings: ScannerSettings, path: PathBuf) -> Result<Self, JournalError> {
        let (journal, load) = ResearchJournal::open(path)?;
        let mut research_history: VecDeque<_> = load.reports.into_iter().rev().collect();
        research_history.truncate(RESEARCH_HISTORY_CAP);
        let mut history = VecDeque::new();
        for report in &research_history {
            for scan in report.reports.iter().rev() {
                history.push_back(scan.clone());
                if history.len() == HISTORY_CAP {
                    break;
                }
            }
            if history.len() == HISTORY_CAP {
                break;
            }
        }
        Ok(Self {
            settings,
            history: Arc::new(Mutex::new(history)),
            research_history: Arc::new(Mutex::new(research_history)),
            scan_lock: Arc::new(Semaphore::new(1)),
            journal: Some(journal),
            journal_rejected_lines: load.rejected_lines,
        })
    }
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    read_only: bool,
    scan_in_progress: bool,
    history_count: usize,
    research_run_count: usize,
    latest_observed_at_ms: Option<u64>,
    persistence: &'static str,
    journal_rejected_lines: usize,
}

#[derive(Debug, Serialize)]
struct ConfigResponse {
    defaults: ScannerSettings,
    providers: [&'static str; 2],
    history_retention: &'static str,
    journal_path: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
pub struct ScanRequest {
    pub quote_coin: Option<String>,
    pub amount_in: Option<String>,
    pub gas_cost: Option<String>,
    pub min_profit_bps: Option<String>,
    pub max_quote_skew_ms: Option<u64>,
    pub timeout_ms: Option<u64>,
    pub retries: Option<u32>,
    pub cetus_sources: Option<Vec<String>>,
    pub seven_k_sources: Option<Vec<String>>,
}

#[derive(Debug, Default, Deserialize)]
pub struct ResearchRequest {
    pub amounts: Option<Vec<String>>,
    pub markets: Option<Vec<String>>,
    #[serde(flatten)]
    pub scan: ScanRequest,
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
        .route("/api/research", axum::routing::post(run_research))
        .route("/api/cartography", get(cartography))
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
    let research_history = state.research_history.lock().await;
    Json(HealthResponse {
        status: "ok",
        read_only: true,
        scan_in_progress: state.scan_lock.available_permits() == 0,
        history_count: history.len(),
        research_run_count: research_history.len(),
        latest_observed_at_ms: history.front().map(|report| report.observed_at_ms),
        persistence: if state.journal.is_some() {
            "jsonl"
        } else {
            "memory_only"
        },
        journal_rejected_lines: state.journal_rejected_lines,
    })
}

async fn config(State(state): State<ApiState>) -> Json<ConfigResponse> {
    Json(ConfigResponse {
        defaults: state.settings,
        providers: ["cetus", "seven_k"],
        history_retention: "100_scans_and_250_research_runs",
        journal_path: state
            .journal
            .as_ref()
            .map(|journal| journal.path().display().to_string()),
    })
}

async fn cartography(State(state): State<ApiState>) -> Json<CartographyReport> {
    let history: Vec<_> = state
        .research_history
        .lock()
        .await
        .iter()
        .cloned()
        .collect();
    Json(build_cartography(
        &history,
        now_ms(),
        state.journal_rejected_lines,
    ))
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
    let retention = if state.journal.is_some() {
        "latest_100_scans_from_persistent_research_journal"
    } else {
        "memory_only_100_reports"
    };
    let reports = state
        .history
        .lock()
        .await
        .iter()
        .take(limit)
        .cloned()
        .collect();
    Json(HistoryResponse { reports, retention })
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

async fn run_research(
    State(state): State<ApiState>,
    Json(request): Json<ResearchRequest>,
) -> Result<Json<ResearchReport>, ApiError> {
    let permit = state.scan_lock.clone().try_acquire_owned().map_err(|_| {
        ApiError(
            StatusCode::CONFLICT,
            "scan_in_progress",
            "Another scan or research run is already running.".to_owned(),
        )
    })?;
    let amounts = parse_research_amounts(request.amounts)?;
    let markets = parse_research_markets(request.markets)?;
    let base_settings = apply_request(state.settings.clone(), request.scan)?;
    let mut discovery_reports = Vec::new();
    let mut confirmation_pairs = BTreeSet::new();

    for market in &markets {
        for amount in &amounts {
            let mut settings = base_settings.clone();
            settings.quote_coin.clone_from(market);
            settings.amount_in = *amount;
            let report = run_with_settings(&settings).await?;
            if report.opportunities().next().is_some() {
                confirmation_pairs.insert((market.clone(), *amount));
            }
            discovery_reports.push(report);
        }
    }

    let mut isolated_reports = Vec::new();
    for (market, amount) in confirmation_pairs {
        for _ in 0..CONFIRMATION_RUNS {
            let mut settings = base_settings.clone();
            settings.quote_coin.clone_from(&market);
            settings.amount_in = amount;
            isolated_reports
                .push(run_with_isolated_settings(&settings, &base_settings.seven_k_sources).await?);
        }
    }
    drop(permit);

    let opportunities = confirm_opportunities(&isolated_reports, MIN_CONFIRMATIONS);
    let discovery_report_count = discovery_reports.len();
    let venue_isolated_report_count = isolated_reports.len();
    let venues_tested = if isolated_reports.is_empty() {
        Vec::new()
    } else {
        base_settings.seven_k_sources.clone()
    };
    let mut reports = discovery_reports;
    reports.extend(isolated_reports);
    let routes_evaluated = reports.iter().map(|report| report.candidates.len()).sum();
    let provider_failures = reports.iter().map(|report| report.failures.len()).sum();
    let response = ResearchReport {
        schema_version: 2,
        observed_at_ms: now_ms(),
        amounts_tested: amounts,
        markets_tested: markets,
        routes_evaluated,
        provider_failures,
        confirmation_runs: CONFIRMATION_RUNS,
        discovery_reports: discovery_report_count,
        venue_isolated_reports: venue_isolated_report_count,
        venues_tested,
        opportunities,
        reports,
    };

    if let Some(journal) = &state.journal {
        journal.append(&response).map_err(|error| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "journal_write_failed",
                error.to_string(),
            )
        })?;
    }

    let mut history = state.history.lock().await;
    for report in &response.reports {
        history.push_front(report.clone());
    }
    history.truncate(HISTORY_CAP);
    drop(history);
    let mut research_history = state.research_history.lock().await;
    research_history.push_front(response.clone());
    research_history.truncate(RESEARCH_HISTORY_CAP);
    Ok(Json(response))
}

async fn run_with_settings(settings: &ScannerSettings) -> Result<ScanReport, ApiError> {
    let scanner = settings.scanner().map_err(|error| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_settings",
            error.to_string(),
        )
    })?;
    scanner
        .scan()
        .await
        .map_err(|error| ApiError(StatusCode::BAD_GATEWAY, "scan_failed", error.to_string()))
}

async fn run_with_isolated_settings(
    settings: &ScannerSettings,
    venues: &[String],
) -> Result<ScanReport, ApiError> {
    let scanner = settings.venue_isolated_scanner(venues).map_err(|error| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_isolated_settings",
            error.to_string(),
        )
    })?;
    scanner.scan().await.map_err(|error| {
        ApiError(
            StatusCode::BAD_GATEWAY,
            "isolated_scan_failed",
            error.to_string(),
        )
    })
}

fn apply_request(
    mut settings: ScannerSettings,
    request: ScanRequest,
) -> Result<ScannerSettings, ApiError> {
    if let Some(value) = request.quote_coin {
        settings.quote_coin = value.trim().to_owned();
    }
    if let Some(value) = request.amount_in {
        settings.amount_in = parse(&value, "amount_in")?;
    }
    if let Some(value) = request.gas_cost {
        settings.gas_cost = parse(&value, "gas_cost")?;
    }
    if let Some(value) = request.min_profit_bps {
        settings.min_profit_bps = parse(&value, "min_profit_bps")?;
    }
    if let Some(value) = request.max_quote_skew_ms {
        settings.max_quote_skew_ms = value;
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
    if settings.quote_coin.is_empty() {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_settings",
            "quote_coin must not be empty".to_owned(),
        ));
    }
    settings
        .validate()
        .map_err(|message| ApiError(StatusCode::BAD_REQUEST, "invalid_settings", message))?;
    Ok(settings)
}

fn parse_research_amounts(values: Option<Vec<String>>) -> Result<Vec<u128>, ApiError> {
    let values = values.unwrap_or_else(|| DEFAULT_AMOUNTS.map(|value| value.to_string()).to_vec());
    if values.is_empty() || values.len() > MAX_AMOUNTS {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_research_amounts",
            format!("amounts must contain between 1 and {MAX_AMOUNTS} values"),
        ));
    }
    let amounts: Vec<u128> = values
        .iter()
        .map(|value| parse(value, "amounts"))
        .collect::<Result<_, _>>()?;
    if amounts.contains(&0) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_research_amounts",
            "amounts must be greater than zero".to_owned(),
        ));
    }
    if amounts.iter().copied().collect::<BTreeSet<_>>().len() != amounts.len() {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_research_amounts",
            "amounts must not contain duplicates".to_owned(),
        ));
    }
    Ok(amounts)
}

fn parse_research_markets(values: Option<Vec<String>>) -> Result<Vec<String>, ApiError> {
    let markets = values.unwrap_or_else(|| DEFAULT_MARKETS.map(ToOwned::to_owned).to_vec());
    if markets.is_empty() || markets.len() > MAX_MARKETS {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_research_markets",
            format!("markets must contain between 1 and {MAX_MARKETS} coin types"),
        ));
    }
    if markets.iter().any(|market| market.trim().is_empty()) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_research_markets",
            "markets must not contain empty coin types".to_owned(),
        ));
    }
    if markets.iter().collect::<BTreeSet<_>>().len() != markets.len() {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_research_markets",
            "markets must not contain duplicates".to_owned(),
        ));
    }
    Ok(markets)
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

    #[tokio::test]
    async fn cartography_is_typed_when_research_is_empty() {
        let response = router(ApiState::new(ScannerSettings::default()))
            .oneshot(
                Request::get("/api/cartography")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["research_runs"], 0);
        assert_eq!(json["cells"], serde_json::json!([]));
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

    #[test]
    fn research_amounts_are_bounded_and_unique() {
        assert_eq!(
            parse_research_amounts(Some(vec!["100".to_owned(), "200".to_owned()])).unwrap(),
            [100, 200]
        );
        assert!(parse_research_amounts(Some(vec!["100".to_owned(), "100".to_owned()])).is_err());
        assert!(parse_research_amounts(Some(Vec::new())).is_err());
    }

    #[test]
    fn research_markets_are_bounded_and_unique() {
        assert_eq!(
            parse_research_markets(Some(vec!["A".to_owned(), "B".to_owned()])).unwrap(),
            ["A", "B"]
        );
        assert!(parse_research_markets(Some(vec!["A".to_owned(), "A".to_owned()])).is_err());
        assert!(parse_research_markets(Some(Vec::new())).is_err());
    }
}
