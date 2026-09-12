use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
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
    app::{NATIVE_USDC, SUI, ScannerSettings},
    cartography::{CartographyReport, build_cartography},
    http::now_ms,
    journal::{JournalError, ResearchJournal},
    research::{
        AdaptiveSizingEvidence, CONFIRMATION_RUNS, MAX_AMOUNTS, MAX_MARKETS, MIN_CONFIRMATIONS,
        MarketDefinition, MarketSizingEvidence, ONE_USDC_ATOMIC, USD_NOTIONAL_TARGETS, USDC, XBTC,
        atomic_unit, confirm_opportunities, convert_sui_gas_to_base, default_market_registry,
        positive_market_amount_pairs, usd_normalized_amounts, validate_market_registry,
    },
    simulation::{AtomicSimulator, confirm_atomic_simulation},
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
    simulator: Option<Arc<dyn AtomicSimulator>>,
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
            simulator: None,
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
            simulator: None,
        })
    }

    #[must_use]
    pub fn with_simulator(mut self, simulator: Arc<dyn AtomicSimulator>) -> Self {
        self.simulator = Some(simulator);
        self
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
    market_registry: Vec<MarketDefinition>,
    providers: [&'static str; 2],
    history_retention: &'static str,
    journal_path: Option<String>,
    simulation_mode: &'static str,
    simulation_confirmations_required: usize,
}

#[derive(Debug, Default, Deserialize)]
pub struct ScanRequest {
    pub base_coin: Option<String>,
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
    pub markets: Option<Vec<MarketDefinition>>,
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
        market_registry: default_market_registry(),
        providers: ["cetus", "seven_k"],
        history_retention: "100_scans_and_250_research_runs",
        journal_path: state
            .journal
            .as_ref()
            .map(|journal| journal.path().display().to_string()),
        simulation_mode: if state.simulator.is_some() {
            "unsigned_atomic_ptb"
        } else {
            "disabled"
        },
        simulation_confirmations_required: 2,
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
    let _permit = state.scan_lock.clone().try_acquire_owned().map_err(|_| {
        ApiError(
            StatusCode::CONFLICT,
            "scan_in_progress",
            "Another scan or research run is already running.".to_owned(),
        )
    })?;
    let ResearchRequest {
        amounts,
        markets,
        scan,
    } = request;
    let markets = parse_research_markets(markets)?;
    let base_settings = apply_request(state.settings.clone(), scan)?;
    let explicit_amounts = amounts
        .map(|values| parse_research_amounts(Some(values)))
        .transpose()?;
    let (market_sizing, adaptive_sizing) =
        build_market_sizing(&base_settings, &markets, explicit_amounts).await?;
    let mut discovery_reports = Vec::new();

    for sizing in &market_sizing {
        for amount in &sizing.amounts {
            let mut settings = base_settings.clone();
            settings.base_coin.clone_from(&sizing.base_coin);
            settings.quote_coin.clone_from(&sizing.quote_coin);
            settings.amount_in = *amount;
            settings.gas_cost = sizing.gas_cost_base;
            let report = run_with_settings(&settings).await?;
            discovery_reports.push(report);
        }
    }

    let mut isolated_reports = Vec::new();
    for ((base_coin, quote_coin, amount), _) in positive_market_amount_pairs(&discovery_reports) {
        let sizing = market_sizing
            .iter()
            .find(|sizing| sizing.base_coin == base_coin && sizing.quote_coin == quote_coin)
            .ok_or_else(|| {
                ApiError(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "research_plan_missing",
                    "Positive pair had no matching sizing plan".to_owned(),
                )
            })?;
        for _ in 0..CONFIRMATION_RUNS {
            let mut settings = base_settings.clone();
            settings.base_coin.clone_from(&base_coin);
            settings.quote_coin.clone_from(&quote_coin);
            settings.amount_in = amount;
            settings.gas_cost = sizing.gas_cost_base;
            isolated_reports
                .push(run_with_isolated_settings(&settings, &base_settings.seven_k_sources).await?);
        }
    }
    let mut opportunities = confirm_opportunities(&isolated_reports, MIN_CONFIRMATIONS);
    if let Some(simulator) = &state.simulator {
        for opportunity in &mut opportunities {
            if opportunity.base_coin == SUI {
                confirm_atomic_simulation(opportunity, simulator.as_ref()).await;
            } else {
                opportunity.simulation_status = "unsupported_base".to_owned();
            }
        }
    }
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
    let amounts_tested = market_sizing
        .iter()
        .flat_map(|sizing| sizing.amounts.iter().copied())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let response = ResearchReport {
        schema_version: 5,
        observed_at_ms: now_ms(),
        amounts_tested,
        markets_tested: market_sizing
            .iter()
            .map(|sizing| sizing.market_symbol.clone())
            .collect(),
        market_metadata: markets,
        adaptive_sizing,
        market_sizing,
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

#[derive(Debug, Clone)]
struct BaseCalibration {
    reference_amount_in: u128,
    usdc_per_base_atomic: u128,
    providers: Vec<String>,
}

async fn build_market_sizing(
    settings: &ScannerSettings,
    markets: &[MarketDefinition],
    explicit_amounts: Option<Vec<u128>>,
) -> Result<(Vec<MarketSizingEvidence>, Option<AdaptiveSizingEvidence>), ApiError> {
    let active: Vec<_> = markets.iter().filter(|market| market.scannable()).collect();
    let unique_bases: BTreeSet<_> = active
        .iter()
        .map(|market| market.base_coin.as_str())
        .collect();
    if explicit_amounts.is_some() && unique_bases.len() > 1 {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "ambiguous_research_amounts",
            "explicit amounts require enabled markets to share one base coin".to_owned(),
        ));
    }

    let sui = calibrate_base_usdc(settings, SUI, "SUI", 9).await?;
    let mut calibrations = BTreeMap::from([(SUI.to_owned(), sui.clone())]);
    for market in &active {
        if !calibrations.contains_key(&market.base_coin) {
            let calibration = calibrate_base_usdc(
                settings,
                &market.base_coin,
                &market.base_symbol,
                market.base_decimals,
            )
            .await?;
            calibrations.insert(market.base_coin.clone(), calibration);
        }
    }

    let mut sizing = Vec::with_capacity(active.len());
    for market in active {
        let calibration = calibrations.get(&market.base_coin).ok_or_else(|| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "base_calibration_missing",
                format!("No calibration found for {}", market.base_symbol),
            )
        })?;
        let base_unit = atomic_unit(market.base_decimals).map_err(sizing_error)?;
        let amounts = match &explicit_amounts {
            Some(values) => values.clone(),
            None => usd_normalized_amounts(calibration.usdc_per_base_atomic, base_unit)
                .map_err(sizing_error)?,
        };
        let gas_cost_base = convert_sui_gas_to_base(
            settings.gas_cost,
            sui.usdc_per_base_atomic,
            calibration.usdc_per_base_atomic,
            base_unit,
        )
        .map_err(sizing_error)?;
        sizing.push(MarketSizingEvidence {
            market_symbol: market.symbol.clone(),
            base_coin: market.base_coin.clone(),
            base_symbol: market.base_symbol.clone(),
            base_decimals: market.base_decimals,
            quote_coin: market.coin_type.clone(),
            quote_symbol: market.resolved_quote_symbol().to_owned(),
            quote_decimals: market.decimals,
            reference_amount_in: calibration.reference_amount_in,
            usdc_per_base_atomic: calibration.usdc_per_base_atomic,
            providers: calibration.providers.clone(),
            usd_targets: USD_NOTIONAL_TARGETS.to_vec(),
            amounts,
            gas_cost_base,
        });
    }

    let adaptive = Some(AdaptiveSizingEvidence {
        quote_coin: NATIVE_USDC.to_owned(),
        reference_amount_in: sui.reference_amount_in,
        usdc_per_sui_atomic: sui.usdc_per_base_atomic,
        providers: sui.providers,
        usd_targets: USD_NOTIONAL_TARGETS.to_vec(),
    });
    Ok((sizing, adaptive))
}

async fn calibrate_base_usdc(
    settings: &ScannerSettings,
    base_coin: &str,
    base_symbol: &str,
    base_decimals: u8,
) -> Result<BaseCalibration, ApiError> {
    let base_unit = atomic_unit(base_decimals).map_err(sizing_error)?;
    if base_coin == USDC {
        return Ok(BaseCalibration {
            reference_amount_in: base_unit,
            usdc_per_base_atomic: ONE_USDC_ATOMIC,
            providers: vec!["native_usdc_parity".to_owned()],
        });
    }

    let reference_amount_in = if base_coin == XBTC {
        base_unit / 100
    } else {
        base_unit
    };
    let mut calibration = settings.clone();
    calibration.base_coin = base_coin.to_owned();
    calibration.quote_coin = NATIVE_USDC.to_owned();
    calibration.amount_in = reference_amount_in;
    let scanner = calibration.scanner().map_err(|error| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_adaptive_sizing_settings",
            error.to_string(),
        )
    })?;
    let (quotes, failures) = scanner.forward_quotes().await.map_err(|error| {
        ApiError(
            StatusCode::BAD_GATEWAY,
            "adaptive_sizing_failed",
            error.to_string(),
        )
    })?;
    let observations: BTreeMap<_, _> = quotes
        .into_iter()
        .filter(|quote| quote.amount_in == reference_amount_in && quote.amount_out > 0)
        .map(|quote| {
            quote
                .amount_out
                .checked_mul(base_unit)
                .map(|normalized| (quote.provider, normalized / reference_amount_in))
        })
        .collect::<Option<_>>()
        .ok_or_else(|| sizing_error("base calibration overflowed"))?;
    if observations.is_empty() {
        let detail = failures
            .first()
            .map(|failure| failure.message.as_str())
            .unwrap_or("providers returned no valid base/USDC quote");
        return Err(ApiError(
            StatusCode::BAD_GATEWAY,
            "adaptive_sizing_failed",
            format!("Could not calibrate {base_symbol}/USDC: {detail}"),
        ));
    }
    let usdc_per_base_atomic = median(observations.values().copied())?;
    validate_calibration(base_coin, usdc_per_base_atomic)?;
    Ok(BaseCalibration {
        reference_amount_in,
        usdc_per_base_atomic,
        providers: observations.into_keys().collect(),
    })
}

fn median(values: impl IntoIterator<Item = u128>) -> Result<u128, ApiError> {
    let mut prices: Vec<_> = values.into_iter().collect();
    prices.sort_unstable();
    let middle = prices.len() / 2;
    if prices.len().is_multiple_of(2) {
        prices[middle - 1]
            .checked_add(prices[middle])
            .map(|sum| sum / 2)
            .ok_or_else(|| sizing_error("base/USDC calibration median overflowed"))
    } else {
        Ok(prices[middle])
    }
}

fn validate_calibration(base_coin: &str, price: u128) -> Result<(), ApiError> {
    let plausible = if base_coin == SUI {
        (10_000..=100_000_000).contains(&price)
    } else if base_coin == XBTC {
        (1_000_000_000..=1_000_000_000_000).contains(&price)
    } else {
        price > 0
    };
    if plausible {
        Ok(())
    } else {
        Err(sizing_error(
            "base/USDC calibration price is outside plausible bounds",
        ))
    }
}

fn sizing_error(message: &'static str) -> ApiError {
    ApiError(
        StatusCode::BAD_GATEWAY,
        "adaptive_sizing_failed",
        message.to_owned(),
    )
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
    if let Some(value) = request.base_coin {
        settings.base_coin = value.trim().to_owned();
    }
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
    if settings.base_coin.is_empty() || settings.quote_coin.is_empty() {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_settings",
            "base_coin and quote_coin must not be empty".to_owned(),
        ));
    }
    if settings.base_coin == settings.quote_coin {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_settings",
            "base_coin and quote_coin must differ".to_owned(),
        ));
    }
    settings
        .validate()
        .map_err(|message| ApiError(StatusCode::BAD_REQUEST, "invalid_settings", message))?;
    Ok(settings)
}

fn parse_research_amounts(values: Option<Vec<String>>) -> Result<Vec<u128>, ApiError> {
    let values = values.ok_or_else(|| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_research_amounts",
            "explicit amounts must be supplied".to_owned(),
        )
    })?;
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

fn parse_research_markets(
    values: Option<Vec<MarketDefinition>>,
) -> Result<Vec<MarketDefinition>, ApiError> {
    let markets = values.unwrap_or_else(default_market_registry);
    if markets.is_empty() || markets.len() > MAX_MARKETS {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_research_markets",
            format!("markets must contain between 1 and {MAX_MARKETS} coin types"),
        ));
    }
    validate_market_registry(&markets).map_err(|message| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_research_markets",
            message.to_owned(),
        )
    })?;
    if !markets.iter().any(MarketDefinition::scannable) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "invalid_research_markets",
            "at least one market must be enabled for scanning".to_owned(),
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
    use crate::{Opportunity, Quote, RouteHop};

    fn sample_research_report() -> ResearchReport {
        let quote = |provider: &str, pool: &str, amount_in, amount_out| Quote {
            provider: provider.to_owned(),
            coin_in: "A".to_owned(),
            coin_out: "B".to_owned(),
            amount_in,
            amount_out,
            quote_id: None,
            route: vec![RouteHop {
                route_index: 0,
                venue: provider.to_owned(),
                pool_id: pool.to_owned(),
                coin_in: "A".to_owned(),
                coin_out: "B".to_owned(),
            }],
            estimated_gas_cost: None,
            observed_at_ms: 1,
            latency_ms: 1,
        };
        ResearchReport {
            schema_version: 5,
            observed_at_ms: 1,
            amounts_tested: vec![100],
            markets_tested: vec!["B".to_owned()],
            market_metadata: vec![MarketDefinition {
                symbol: "A/B".to_owned(),
                base_coin: "A".to_owned(),
                base_symbol: "A".to_owned(),
                base_decimals: 9,
                coin_type: "B".to_owned(),
                quote_symbol: "B".to_owned(),
                decimals: 6,
                enabled: true,
                watchlist_only: false,
            }],
            adaptive_sizing: None,
            market_sizing: Vec::new(),
            routes_evaluated: 1,
            provider_failures: 0,
            confirmation_runs: 3,
            discovery_reports: 1,
            venue_isolated_reports: 0,
            venues_tested: Vec::new(),
            opportunities: Vec::new(),
            reports: vec![ScanReport {
                schema_version: 1,
                observed_at_ms: 1,
                base_coin: "A".to_owned(),
                quote_coin: "B".to_owned(),
                amount_in: 100,
                gas_cost: 1,
                min_profit_bps: 1,
                candidates: vec![Opportunity {
                    forward: quote("cetus", "forward", 100, 110),
                    reverse: quote("seven_k", "reverse", 110, 105),
                    same_quote_provider: false,
                    shared_pool_ids: Vec::new(),
                    returned_base: 105,
                    gross_profit: 5,
                    gas_cost: 1,
                    net_profit: 4,
                    net_profit_bps: 400,
                    quote_skew_ms: 0,
                    rejection_reasons: Vec::new(),
                    meets_threshold: true,
                }],
                failures: Vec::new(),
            }],
        }
    }

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

    #[tokio::test]
    async fn cartography_populated_endpoint_has_stable_shape() {
        let state = ApiState::new(ScannerSettings::default());
        state
            .research_history
            .lock()
            .await
            .push_front(sample_research_report());
        let response = router(state)
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
        assert_eq!(json["schema_version"], 3);
        assert_eq!(json["cells"].as_array().unwrap().len(), 1);
        assert_eq!(json["cells"][0]["market_symbol"], "A/B");
        assert_eq!(json["cells"][0]["simulation_status"], "pending");
        assert_eq!(json["cells"][0]["best_net_profit"], "4");
    }

    #[test]
    fn staged_research_response_serializes_explicit_contract() {
        let json = serde_json::to_value(sample_research_report()).unwrap();
        assert_eq!(json["schema_version"], 5);
        assert_eq!(json["discovery_reports"], 1);
        assert_eq!(json["venue_isolated_reports"], 0);
        assert_eq!(json["market_metadata"][0]["symbol"], "A/B");
        assert_eq!(json["amounts_tested"][0], "100");
        assert_eq!(json["reports"][0]["candidates"][0]["net_profit"], "4");
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
        let market = |symbol: &str, coin_type: &str| MarketDefinition {
            symbol: symbol.to_owned(),
            base_coin: "SUI".to_owned(),
            base_symbol: "SUI".to_owned(),
            base_decimals: 9,
            coin_type: coin_type.to_owned(),
            quote_symbol: symbol.to_owned(),
            decimals: 9,
            enabled: true,
            watchlist_only: false,
        };
        let parsed =
            parse_research_markets(Some(vec![market("A", "A"), market("B", "B")])).unwrap();
        assert_eq!(parsed[0].coin_type, "A");
        assert_eq!(parsed[1].coin_type, "B");
        assert!(parse_research_markets(Some(vec![market("A", "A"), market("A2", "A")])).is_err());
        assert!(parse_research_markets(Some(Vec::new())).is_err());
        let mut watchlist = market("WATCH", "W");
        watchlist.enabled = false;
        watchlist.watchlist_only = true;
        assert!(parse_research_markets(Some(vec![watchlist])).is_err());
    }

    #[tokio::test]
    async fn config_returns_explicit_market_metadata() {
        let response = router(ApiState::new(ScannerSettings::default()))
            .oneshot(Request::get("/api/config").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["market_registry"].as_array().unwrap().len(), 6);
        assert_eq!(json["market_registry"][0]["symbol"], "USDC/USDT");
        assert_eq!(json["market_registry"][0]["base_symbol"], "USDC");
        assert_eq!(json["market_registry"][0]["quote_symbol"], "USDT");
        assert_eq!(json["market_registry"][0]["decimals"], 6);
        assert_eq!(json["market_registry"][0]["enabled"], true);
        assert_eq!(json["market_registry"][5]["symbol"], "USDC/ETH");
        assert_eq!(json["market_registry"][5]["watchlist_only"], true);
        assert_eq!(json["market_registry"][5]["enabled"], false);
    }
}
