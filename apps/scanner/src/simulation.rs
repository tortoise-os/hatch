use std::{path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::{io::AsyncWriteExt, process::Command};

use crate::{ConfirmedOpportunity, http::now_ms};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AtomicSimulationConfig {
    pub sender: String,
    pub flash_pool_id: String,
    pub flash_pool_coin_a: String,
    pub flash_pool_coin_b: String,
    pub flash_pool_fee_rate_ppm: u32,
    pub slippage_bps: u16,
    pub sui_grpc_url: String,
    pub aggregator_endpoint: Option<String>,
}

impl AtomicSimulationConfig {
    pub fn from_env() -> Result<Option<Self>, SimulationError> {
        let enabled = std::env::var("HATCH_SIMULATION_ENABLED")
            .ok()
            .is_some_and(|value| matches!(value.as_str(), "1" | "true" | "TRUE"));
        if !enabled {
            return Ok(None);
        }
        let required = |name: &'static str| {
            std::env::var(name).map_err(|_| {
                SimulationError::Config(format!("{name} is required when simulation is enabled"))
            })
        };
        let fee = required("HATCH_FLASH_POOL_FEE_RATE_PPM")?
            .parse::<u32>()
            .map_err(|_| {
                SimulationError::Config(
                    "HATCH_FLASH_POOL_FEE_RATE_PPM must be an integer".to_owned(),
                )
            })?;
        if fee > 1_000_000 {
            return Err(SimulationError::Config(
                "HATCH_FLASH_POOL_FEE_RATE_PPM must not exceed 1000000".to_owned(),
            ));
        }
        Ok(Some(Self {
            sender: required("HATCH_SIMULATION_SENDER")?,
            flash_pool_id: required("HATCH_FLASH_POOL_ID")?,
            flash_pool_coin_a: required("HATCH_FLASH_POOL_COIN_A")?,
            flash_pool_coin_b: required("HATCH_FLASH_POOL_COIN_B")?,
            flash_pool_fee_rate_ppm: fee,
            slippage_bps: std::env::var("HATCH_SIMULATION_SLIPPAGE_BPS")
                .unwrap_or_else(|_| "30".to_owned())
                .parse::<u16>()
                .map_err(|_| {
                    SimulationError::Config(
                        "HATCH_SIMULATION_SLIPPAGE_BPS must be an integer".to_owned(),
                    )
                })?,
            sui_grpc_url: std::env::var("HATCH_SUI_GRPC_URL")
                .unwrap_or_else(|_| "https://fullnode.mainnet.sui.io:443".to_owned()),
            aggregator_endpoint: std::env::var("HATCH_CETUS_AGGREGATOR_ENDPOINT").ok(),
        }))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct AtomicSimulationRequest<'a> {
    sender: &'a str,
    #[serde(with = "crate::model::u128_string")]
    amount_in: u128,
    quote_coin: &'a str,
    route_fingerprint: &'a str,
    forward_provider: &'a str,
    reverse_provider: &'a str,
    forward_pool_ids: Vec<&'a str>,
    reverse_pool_ids: Vec<&'a str>,
    flash_pool_id: &'a str,
    flash_pool_coin_a: &'a str,
    flash_pool_coin_b: &'a str,
    flash_pool_fee_rate_ppm: u32,
    slippage_bps: u16,
    sui_grpc_url: &'a str,
    aggregator_endpoint: Option<&'a str>,
}

impl<'a> AtomicSimulationRequest<'a> {
    fn new(config: &'a AtomicSimulationConfig, opportunity: &'a ConfirmedOpportunity) -> Self {
        Self {
            sender: &config.sender,
            amount_in: opportunity.amount_in,
            quote_coin: &opportunity.quote_coin,
            route_fingerprint: &opportunity.route_fingerprint,
            forward_provider: &opportunity.representative.forward.provider,
            reverse_provider: &opportunity.representative.reverse.provider,
            forward_pool_ids: opportunity
                .representative
                .forward
                .route
                .iter()
                .map(|hop| hop.pool_id.as_str())
                .collect(),
            reverse_pool_ids: opportunity
                .representative
                .reverse
                .route
                .iter()
                .map(|hop| hop.pool_id.as_str())
                .collect(),
            flash_pool_id: &config.flash_pool_id,
            flash_pool_coin_a: &config.flash_pool_coin_a,
            flash_pool_coin_b: &config.flash_pool_coin_b,
            flash_pool_fee_rate_ppm: config.flash_pool_fee_rate_ppm,
            slippage_bps: config.slippage_bps,
            sui_grpc_url: &config.sui_grpc_url,
            aggregator_endpoint: config.aggregator_endpoint.as_deref(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AtomicSimulationResult {
    pub status: String,
    pub route_fingerprint: String,
    pub rebuilt_route_fingerprint: Option<String>,
    pub observed_at_ms: u64,
    #[serde(with = "crate::model::u128_string")]
    pub measured_gas_cost: u128,
    #[serde(with = "crate::model::i128_string")]
    pub balance_delta: i128,
    pub command_results: usize,
    pub effects_requested: bool,
    pub balance_changes_requested: bool,
    pub command_results_requested: bool,
    pub command_trace: Vec<String>,
    pub error: Option<String>,
}

impl AtomicSimulationResult {
    #[must_use]
    pub fn positive_for(&self, fingerprint: &str) -> bool {
        self.status == "positive"
            && self.balance_delta > 0
            && self.route_fingerprint == fingerprint
            && self.rebuilt_route_fingerprint.as_deref() == Some(fingerprint)
            && self.effects_requested
            && self.balance_changes_requested
            && self.command_results_requested
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AtomicSimulationEvidence {
    pub first_seen_at_ms: u64,
    pub last_positive_at_ms: Option<u64>,
    pub confirmation_count: usize,
    pub attempts: usize,
    pub elapsed_half_life_ms: Option<u64>,
    #[serde(with = "crate::model::u128_string")]
    pub measured_gas_cost: u128,
    #[serde(with = "crate::model::i128_string")]
    pub balance_delta: i128,
    pub failure_reason: Option<String>,
    pub results: Vec<AtomicSimulationResult>,
}

#[derive(Debug, Error)]
pub enum SimulationError {
    #[error("simulation configuration error: {0}")]
    Config(String),
    #[error("simulation process failed: {0}")]
    Process(#[from] std::io::Error),
    #[error("simulation response was invalid: {0}")]
    Response(String),
}

#[async_trait]
pub trait AtomicSimulator: Send + Sync {
    async fn simulate(
        &self,
        opportunity: &ConfirmedOpportunity,
    ) -> Result<AtomicSimulationResult, SimulationError>;
}

#[derive(Debug, Clone)]
pub struct CommandAtomicSimulator {
    config: Arc<AtomicSimulationConfig>,
    bun_binary: String,
    cli_path: PathBuf,
}

impl CommandAtomicSimulator {
    #[must_use]
    pub fn new(config: AtomicSimulationConfig) -> Self {
        Self {
            config: Arc::new(config),
            bun_binary: std::env::var("HATCH_BUN_BINARY").unwrap_or_else(|_| "bun".to_owned()),
            cli_path: PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("simulator")
                .join("src")
                .join("cli.ts"),
        }
    }
}

#[async_trait]
impl AtomicSimulator for CommandAtomicSimulator {
    async fn simulate(
        &self,
        opportunity: &ConfirmedOpportunity,
    ) -> Result<AtomicSimulationResult, SimulationError> {
        let request = serde_json::to_vec(&AtomicSimulationRequest::new(&self.config, opportunity))
            .map_err(|error| SimulationError::Response(error.to_string()))?;
        let mut child = Command::new(&self.bun_binary)
            .arg("run")
            .arg(&self.cli_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        child
            .stdin
            .take()
            .ok_or_else(|| SimulationError::Response("simulation stdin unavailable".to_owned()))?
            .write_all(&request)
            .await?;
        let output = child.wait_with_output().await?;
        if !output.status.success() {
            return Err(SimulationError::Response(
                String::from_utf8_lossy(&output.stderr).trim().to_owned(),
            ));
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let json = stdout
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .ok_or_else(|| SimulationError::Response("simulation returned no JSON".to_owned()))?;
        serde_json::from_str(json).map_err(|error| SimulationError::Response(error.to_string()))
    }
}

pub async fn confirm_atomic_simulation(
    opportunity: &mut ConfirmedOpportunity,
    simulator: &dyn AtomicSimulator,
) {
    let first = match simulator.simulate(opportunity).await {
        Ok(result) => result,
        Err(error) => failed_result(&opportunity.route_fingerprint, error.to_string()),
    };
    let first_positive = first.positive_for(&opportunity.route_fingerprint);
    let mut results = vec![first];
    if first_positive {
        let second = match simulator.simulate(opportunity).await {
            Ok(result) => result,
            Err(error) => failed_result(&opportunity.route_fingerprint, error.to_string()),
        };
        results.push(second);
    }
    let confirmation_count = results
        .iter()
        .filter(|result| result.positive_for(&opportunity.route_fingerprint))
        .count();
    let confirmed = results.len() == 2 && confirmation_count == 2;
    let first_seen_at_ms = results
        .first()
        .map_or_else(now_ms, |result| result.observed_at_ms);
    let last_positive_at_ms = results
        .iter()
        .rev()
        .find(|result| result.positive_for(&opportunity.route_fingerprint))
        .map(|result| result.observed_at_ms);
    let latest = results.last().expect("simulation evidence is never empty");
    let fingerprint_mismatch = results.iter().any(|result| {
        result.route_fingerprint != opportunity.route_fingerprint
            || result
                .rebuilt_route_fingerprint
                .as_deref()
                .is_some_and(|fingerprint| fingerprint != opportunity.route_fingerprint)
            || result
                .error
                .as_deref()
                .is_some_and(|error| error.contains("route fingerprint mismatch"))
    });
    let failure_reason = if confirmed {
        None
    } else if fingerprint_mismatch {
        Some("route_fingerprint_mismatch".to_owned())
    } else {
        Some(
            latest
                .error
                .clone()
                .unwrap_or_else(|| latest.status.clone()),
        )
    };
    opportunity.simulation_status = if confirmed {
        "simulation_confirmed"
    } else if fingerprint_mismatch {
        "fingerprint_mismatch"
    } else if latest.status == "non_positive" {
        "simulation_non_positive"
    } else {
        "simulation_failed"
    }
    .to_owned();
    opportunity.simulation = Some(AtomicSimulationEvidence {
        first_seen_at_ms,
        last_positive_at_ms,
        confirmation_count,
        attempts: results.len(),
        elapsed_half_life_ms: last_positive_at_ms
            .map(|timestamp| timestamp.saturating_sub(first_seen_at_ms)),
        measured_gas_cost: latest.measured_gas_cost,
        balance_delta: latest.balance_delta,
        failure_reason,
        results,
    });
}

fn failed_result(fingerprint: &str, message: String) -> AtomicSimulationResult {
    AtomicSimulationResult {
        status: "failed".to_owned(),
        route_fingerprint: fingerprint.to_owned(),
        rebuilt_route_fingerprint: None,
        observed_at_ms: now_ms(),
        measured_gas_cost: 0,
        balance_delta: 0,
        command_results: 0,
        effects_requested: true,
        balance_changes_requested: true,
        command_results_requested: true,
        command_trace: Vec::new(),
        error: Some(message),
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::VecDeque, sync::Mutex};

    use crate::{Opportunity, Quote, ScanReport, research::confirm_opportunities};

    use super::*;

    struct FixtureSimulator(Mutex<VecDeque<AtomicSimulationResult>>);

    #[async_trait]
    impl AtomicSimulator for FixtureSimulator {
        async fn simulate(
            &self,
            _opportunity: &ConfirmedOpportunity,
        ) -> Result<AtomicSimulationResult, SimulationError> {
            Ok(self.0.lock().unwrap().pop_front().unwrap())
        }
    }

    fn opportunity() -> ConfirmedOpportunity {
        let quote = |provider: &str| Quote {
            provider: provider.to_owned(),
            coin_in: "A".to_owned(),
            coin_out: "B".to_owned(),
            amount_in: 100,
            amount_out: 110,
            quote_id: None,
            route: Vec::new(),
            estimated_gas_cost: None,
            observed_at_ms: 1,
            latency_ms: 1,
        };
        ConfirmedOpportunity {
            validation_tier: "venue_isolated_quote_confirmed".to_owned(),
            simulation_status: "pending".to_owned(),
            simulation: None,
            route_fingerprint: "route".to_owned(),
            amount_in: 100,
            base_coin: "A".to_owned(),
            quote_coin: "B".to_owned(),
            confirmations: 2,
            samples: 3,
            worst_net_profit: 5,
            best_net_profit: 10,
            max_quote_skew_ms: 1,
            representative: Opportunity {
                forward: quote("seven_k:cetus"),
                reverse: quote("seven_k:turbos"),
                same_quote_provider: false,
                shared_pool_ids: Vec::new(),
                returned_base: 110,
                gross_profit: 10,
                gas_cost: 0,
                net_profit: 10,
                net_profit_bps: 1_000,
                quote_skew_ms: 1,
                rejection_reasons: Vec::new(),
                meets_threshold: true,
            },
        }
    }

    fn result(status: &str, fingerprint: &str, observed_at_ms: u64) -> AtomicSimulationResult {
        AtomicSimulationResult {
            status: status.to_owned(),
            route_fingerprint: fingerprint.to_owned(),
            rebuilt_route_fingerprint: Some(fingerprint.to_owned()),
            observed_at_ms,
            measured_gas_cost: 7,
            balance_delta: if status == "positive" { 3 } else { 0 },
            command_results: 5,
            effects_requested: true,
            balance_changes_requested: true,
            command_results_requested: true,
            command_trace: vec![
                "borrow".to_owned(),
                "forward_swap".to_owned(),
                "reverse_swap".to_owned(),
                "repay".to_owned(),
                "inspect_profit".to_owned(),
            ],
            error: None,
        }
    }

    #[tokio::test]
    async fn two_positive_matching_simulations_promote() {
        let simulator = FixtureSimulator(Mutex::new(VecDeque::from([
            result("positive", "route", 10),
            result("positive", "route", 16),
        ])));
        let mut candidate = opportunity();
        confirm_atomic_simulation(&mut candidate, &simulator).await;
        assert_eq!(candidate.simulation_status, "simulation_confirmed");
        let evidence = candidate.simulation.unwrap();
        assert_eq!(evidence.confirmation_count, 2);
        assert_eq!(evidence.elapsed_half_life_ms, Some(6));
        assert_eq!(evidence.measured_gas_cost, 7);
        assert_eq!(evidence.balance_delta, 3);
    }

    #[tokio::test]
    async fn fingerprint_mismatch_prevents_promotion() {
        let simulator = FixtureSimulator(Mutex::new(VecDeque::from([
            result("positive", "route", 10),
            result("positive", "changed", 11),
        ])));
        let mut candidate = opportunity();
        confirm_atomic_simulation(&mut candidate, &simulator).await;
        assert_eq!(candidate.simulation_status, "fingerprint_mismatch");
        let evidence = candidate.simulation.unwrap();
        assert_eq!(evidence.confirmation_count, 1);
        assert_eq!(
            evidence.failure_reason.as_deref(),
            Some("route_fingerprint_mismatch")
        );

        let mut production_failure = result("failed", "route", 10);
        production_failure.rebuilt_route_fingerprint = None;
        production_failure.error =
            Some("route fingerprint mismatch after isolated rebuild".to_owned());
        let simulator = FixtureSimulator(Mutex::new(VecDeque::from([production_failure])));
        let mut candidate = opportunity();
        confirm_atomic_simulation(&mut candidate, &simulator).await;
        assert_eq!(candidate.simulation_status, "fingerprint_mismatch");
    }

    #[tokio::test]
    async fn failed_or_non_positive_resimulation_prevents_promotion() {
        for (terminal, expected) in [
            ("failed", "simulation_failed"),
            ("non_positive", "simulation_non_positive"),
        ] {
            let simulator = FixtureSimulator(Mutex::new(VecDeque::from([
                result("positive", "route", 10),
                result(terminal, "route", 11),
            ])));
            let mut candidate = opportunity();
            confirm_atomic_simulation(&mut candidate, &simulator).await;
            assert_eq!(candidate.simulation_status, expected);
            assert_eq!(candidate.simulation.unwrap().confirmation_count, 1);
        }
    }

    #[tokio::test]
    async fn quote_confirmation_flows_through_two_simulations() {
        let seed = opportunity();
        let reports: Vec<_> = (0..3)
            .map(|observed_at_ms| ScanReport {
                schema_version: 1,
                observed_at_ms,
                base_coin: "A".to_owned(),
                quote_coin: seed.quote_coin.clone(),
                amount_in: seed.amount_in,
                gas_cost: 0,
                min_profit_bps: 1,
                candidates: vec![seed.representative.clone()],
                failures: Vec::new(),
            })
            .collect();
        let mut confirmed = confirm_opportunities(&reports, 2);
        assert_eq!(confirmed.len(), 1);
        let fingerprint = confirmed[0].route_fingerprint.clone();
        let simulator = FixtureSimulator(Mutex::new(VecDeque::from([
            result("positive", &fingerprint, 10),
            result("positive", &fingerprint, 12),
        ])));

        confirm_atomic_simulation(&mut confirmed[0], &simulator).await;

        assert_eq!(confirmed[0].simulation_status, "simulation_confirmed");
        assert_eq!(
            confirmed[0].simulation.as_ref().unwrap().confirmation_count,
            2
        );
    }
}
