use std::{collections::BTreeSet, sync::Arc, time::Duration};

use futures::future::join_all;
use thiserror::Error;
use tokio::time::sleep;

use crate::{
    http::now_ms,
    model::{Opportunity, ProviderFailure, Quote, ScanReport},
    provider::{ProviderError, QuoteProvider, QuoteRequest},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanConfig {
    pub base_coin: String,
    pub quote_coin: String,
    pub amount_in: u128,
    pub gas_cost: u128,
    pub min_profit_bps: i128,
    pub max_quote_skew_ms: u64,
    pub retries: u32,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ScanError {
    #[error("amount must be greater than zero")]
    ZeroAmount,
    #[error("at least one quote provider is required")]
    NoProviders,
}

pub struct Scanner {
    providers: Vec<Arc<dyn QuoteProvider>>,
    config: ScanConfig,
}

impl Scanner {
    #[must_use]
    pub fn new(providers: Vec<Arc<dyn QuoteProvider>>, config: ScanConfig) -> Self {
        Self { providers, config }
    }

    pub async fn scan(&self) -> Result<ScanReport, ScanError> {
        if self.config.amount_in == 0 {
            return Err(ScanError::ZeroAmount);
        }
        if self.providers.is_empty() {
            return Err(ScanError::NoProviders);
        }

        let forward_request = QuoteRequest {
            coin_in: self.config.base_coin.clone(),
            coin_out: self.config.quote_coin.clone(),
            amount_in: self.config.amount_in,
        };
        let forward_results = join_all(self.providers.iter().map(|provider| {
            let request = forward_request.clone();
            let provider_name = provider.name().to_owned();
            async move {
                (
                    provider_name,
                    quote_with_retry(provider.as_ref(), &request, self.config.retries).await,
                )
            }
        }))
        .await;

        let mut forward_quotes = Vec::new();
        let mut failures = Vec::new();
        for (provider, result) in forward_results {
            match result {
                Ok(quote) => forward_quotes.push(quote),
                Err(error) => failures.push(to_failure(&provider, "forward", error)),
            }
        }

        let reverse_results = join_all(forward_quotes.iter().enumerate().flat_map(
            |(forward_index, forward)| {
                self.providers.iter().map(move |provider| {
                    let provider_name = provider.name().to_owned();
                    let request = QuoteRequest {
                        coin_in: self.config.quote_coin.clone(),
                        coin_out: self.config.base_coin.clone(),
                        amount_in: forward.amount_out,
                    };
                    async move {
                        (
                            forward_index,
                            provider_name,
                            quote_with_retry(provider.as_ref(), &request, self.config.retries)
                                .await,
                        )
                    }
                })
            },
        ))
        .await;

        let mut candidates = Vec::new();
        for (forward_index, provider, result) in reverse_results {
            match result {
                Ok(reverse) => match score(
                    forward_quotes[forward_index].clone(),
                    reverse,
                    self.config.amount_in,
                    self.config.gas_cost,
                    self.config.min_profit_bps,
                    self.config.max_quote_skew_ms,
                ) {
                    Ok(candidate) => candidates.push(candidate),
                    Err(error) => failures.push(to_failure(&provider, "score", error)),
                },
                Err(error) => failures.push(to_failure(&provider, "reverse", error)),
            }
        }

        candidates.sort_by(|left, right| {
            right
                .net_profit_bps
                .cmp(&left.net_profit_bps)
                .then_with(|| left.forward.provider.cmp(&right.forward.provider))
                .then_with(|| left.reverse.provider.cmp(&right.reverse.provider))
        });

        Ok(ScanReport {
            schema_version: 1,
            observed_at_ms: now_ms(),
            base_coin: self.config.base_coin.clone(),
            quote_coin: self.config.quote_coin.clone(),
            amount_in: self.config.amount_in,
            gas_cost: self.config.gas_cost,
            min_profit_bps: self.config.min_profit_bps,
            candidates,
            failures,
        })
    }
}

async fn quote_with_retry(
    provider: &dyn QuoteProvider,
    request: &QuoteRequest,
    retries: u32,
) -> Result<Quote, ProviderError> {
    let mut attempt = 0_u32;
    loop {
        match provider.quote(request).await {
            Ok(quote) => return Ok(quote),
            Err(error) if error.retryable && attempt < retries => {
                let multiplier = 1_u64.checked_shl(attempt.min(4)).unwrap_or(16);
                sleep(Duration::from_millis(100 * multiplier)).await;
                attempt += 1;
            }
            Err(error) => return Err(error),
        }
    }
}

fn score(
    forward: Quote,
    reverse: Quote,
    amount_in: u128,
    gas_cost: u128,
    min_profit_bps: i128,
    max_quote_skew_ms: u64,
) -> Result<Opportunity, ProviderError> {
    let amount = to_i128(amount_in)?;
    let returned = to_i128(reverse.amount_out)?;
    let gas = to_i128(gas_cost)?;
    let gross_profit = returned.checked_sub(amount).ok_or_else(arithmetic_error)?;
    let net_profit = gross_profit.checked_sub(gas).ok_or_else(arithmetic_error)?;
    let net_profit_bps = net_profit
        .checked_mul(10_000)
        .ok_or_else(arithmetic_error)?
        .checked_div(amount)
        .ok_or_else(arithmetic_error)?;
    let forward_pools: BTreeSet<&str> = forward
        .route
        .iter()
        .map(|hop| hop.pool_id.as_str())
        .collect();
    let shared_pool_ids: Vec<String> = reverse
        .route
        .iter()
        .map(|hop| hop.pool_id.as_str())
        .filter(|pool_id| forward_pools.contains(pool_id))
        .map(ToOwned::to_owned)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    drop(forward_pools);
    let same_quote_provider = forward.provider == reverse.provider;
    let quote_skew_ms = forward.observed_at_ms.abs_diff(reverse.observed_at_ms);
    let mut rejection_reasons = Vec::new();
    if net_profit <= 0 {
        rejection_reasons.push("not_positive_after_gas_reserve".to_owned());
    }
    if net_profit_bps < min_profit_bps {
        rejection_reasons.push("below_minimum_profit_bps".to_owned());
    }
    if forward.route.is_empty() || reverse.route.is_empty() {
        rejection_reasons.push("missing_route_evidence".to_owned());
    }
    if !shared_pool_ids.is_empty() {
        rejection_reasons.push("shared_liquidity_between_legs".to_owned());
    }
    if quote_skew_ms > max_quote_skew_ms {
        rejection_reasons.push("quote_observation_skew_too_high".to_owned());
    }
    let meets_threshold = rejection_reasons.is_empty();

    Ok(Opportunity {
        forward,
        reverse,
        same_quote_provider,
        shared_pool_ids,
        returned_base: u128::try_from(returned).map_err(|_| arithmetic_error())?,
        gross_profit,
        gas_cost,
        net_profit,
        net_profit_bps,
        quote_skew_ms,
        rejection_reasons,
        meets_threshold,
    })
}

fn to_i128(value: u128) -> Result<i128, ProviderError> {
    i128::try_from(value).map_err(|_| arithmetic_error())
}

fn arithmetic_error() -> ProviderError {
    ProviderError::new(
        "scanner",
        crate::provider::FailureKind::Arithmetic,
        "atomic amount exceeds checked arithmetic range",
        false,
    )
}

fn to_failure(provider: &str, stage: &str, error: ProviderError) -> ProviderFailure {
    ProviderFailure {
        provider: provider.to_owned(),
        stage: stage.to_owned(),
        kind: error.kind.to_string(),
        retryable: error.retryable,
        message: error.message,
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, sync::Mutex};

    use async_trait::async_trait;
    use pretty_assertions::assert_eq;

    use super::*;
    use crate::{
        model::RouteHop,
        provider::{FailureKind, ProviderError},
    };

    struct MockProvider {
        name: &'static str,
        outputs: Mutex<HashMap<(String, u128), Result<u128, ProviderError>>>,
    }

    impl MockProvider {
        fn new(
            name: &'static str,
            outputs: impl IntoIterator<Item = ((&'static str, u128), Result<u128, ProviderError>)>,
        ) -> Self {
            Self {
                name,
                outputs: Mutex::new(
                    outputs
                        .into_iter()
                        .map(|((coin, amount), result)| ((coin.to_owned(), amount), result))
                        .collect(),
                ),
            }
        }
    }

    #[async_trait]
    impl QuoteProvider for MockProvider {
        fn name(&self) -> &str {
            self.name
        }

        async fn quote(&self, request: &QuoteRequest) -> Result<Quote, ProviderError> {
            let amount_out = self
                .outputs
                .lock()
                .expect("mock lock")
                .get(&(request.coin_in.clone(), request.amount_in))
                .cloned()
                .unwrap_or_else(|| {
                    Err(ProviderError::new(
                        self.name,
                        FailureKind::InvalidRequest,
                        "missing mock quote",
                        false,
                    ))
                })?;
            Ok(Quote {
                provider: self.name.to_owned(),
                coin_in: request.coin_in.clone(),
                coin_out: request.coin_out.clone(),
                amount_in: request.amount_in,
                amount_out,
                quote_id: None,
                route: vec![RouteHop {
                    route_index: 0,
                    venue: self.name.to_owned(),
                    pool_id: format!("{}-pool", self.name),
                    coin_in: request.coin_in.clone(),
                    coin_out: request.coin_out.clone(),
                }],
                estimated_gas_cost: None,
                observed_at_ms: 1,
                latency_ms: 1,
            })
        }
    }

    fn config() -> ScanConfig {
        ScanConfig {
            base_coin: "SUI".to_owned(),
            quote_coin: "USDC".to_owned(),
            amount_in: 1_000,
            gas_cost: 10,
            min_profit_bps: 50,
            max_quote_skew_ms: 2_000,
            retries: 0,
        }
    }

    #[test]
    fn score_requires_distinct_pools_and_bounded_quote_skew() {
        let forward = Quote {
            provider: "alpha".to_owned(),
            coin_in: "SUI".to_owned(),
            coin_out: "USDC".to_owned(),
            amount_in: 1_000,
            amount_out: 2_000,
            quote_id: None,
            route: vec![RouteHop {
                route_index: 0,
                venue: "alpha".to_owned(),
                pool_id: "forward".to_owned(),
                coin_in: "SUI".to_owned(),
                coin_out: "USDC".to_owned(),
            }],
            estimated_gas_cost: None,
            observed_at_ms: 1_000,
            latency_ms: 1,
        };
        let mut reverse = forward.clone();
        reverse.provider = "beta".to_owned();
        reverse.amount_in = 2_000;
        reverse.amount_out = 1_020;
        reverse.route[0].pool_id = "reverse".to_owned();
        reverse.observed_at_ms = 1_100;

        let qualified = score(forward, reverse.clone(), 1_000, 10, 50, 200).unwrap();
        assert!(qualified.meets_threshold);
        assert!(qualified.rejection_reasons.is_empty());

        reverse.observed_at_ms = 1_500;
        let stale = score(qualified.forward, reverse, 1_000, 10, 50, 200).unwrap();
        assert!(!stale.meets_threshold);
        assert_eq!(stale.rejection_reasons, ["quote_observation_skew_too_high"]);
    }

    #[test]
    fn conservative_net_profit_subtracts_full_gas_reserve() {
        let forward = Quote {
            provider: "alpha".to_owned(),
            coin_in: "SUI".to_owned(),
            coin_out: "USDC".to_owned(),
            amount_in: 1_000,
            amount_out: 2_000,
            quote_id: None,
            route: vec![RouteHop {
                route_index: 0,
                venue: "alpha".to_owned(),
                pool_id: "forward".to_owned(),
                coin_in: "SUI".to_owned(),
                coin_out: "USDC".to_owned(),
            }],
            estimated_gas_cost: None,
            observed_at_ms: 1,
            latency_ms: 1,
        };
        let mut reverse = forward.clone();
        reverse.provider = "beta".to_owned();
        reverse.coin_in = "USDC".to_owned();
        reverse.coin_out = "SUI".to_owned();
        reverse.amount_in = 2_000;
        reverse.amount_out = 1_025;
        reverse.route[0].pool_id = "reverse".to_owned();

        let candidate = score(forward, reverse, 1_000, 20, 1, 100).unwrap();
        assert_eq!(candidate.gross_profit, 25);
        assert_eq!(candidate.gas_cost, 20);
        assert_eq!(candidate.net_profit, 5);
        assert_eq!(candidate.net_profit_bps, 50);
    }

    #[tokio::test]
    async fn scanner_ranks_profitable_and_losing_round_trips() {
        let alpha = Arc::new(MockProvider::new(
            "alpha",
            [
                (("SUI", 1_000), Ok(2_000)),
                (("USDC", 2_000), Ok(1_030)),
                (("USDC", 1_900), Ok(1_010)),
            ],
        ));
        let beta = Arc::new(MockProvider::new(
            "beta",
            [
                (("SUI", 1_000), Ok(1_900)),
                (("USDC", 2_000), Ok(990)),
                (("USDC", 1_900), Ok(1_020)),
            ],
        ));

        let report = Scanner::new(vec![alpha, beta], config())
            .scan()
            .await
            .expect("scan succeeds");

        assert_eq!(report.candidates.len(), 4);
        assert_eq!(report.candidates[0].net_profit, 20);
        assert_eq!(report.candidates[0].net_profit_bps, 200);
        assert!(!report.candidates[0].meets_threshold);
        assert!(report.candidates[0].same_quote_provider);
        assert_eq!(report.candidates[0].shared_pool_ids, ["alpha-pool"]);
        assert_eq!(
            report.candidates[0].rejection_reasons,
            ["shared_liquidity_between_legs"]
        );
        assert_eq!(report.candidates[3].net_profit, -20);
        assert!(!report.candidates[3].meets_threshold);
        assert_eq!(report.opportunities().count(), 0);
    }

    #[tokio::test]
    async fn scanner_keeps_complete_routes_after_partial_provider_failure() {
        let failed = ProviderError::new("bad", FailureKind::Upstream, "offline", false);
        let bad = Arc::new(MockProvider::new(
            "bad",
            [
                (("SUI", 1_000), Err(failed.clone())),
                (("USDC", 2_000), Err(failed)),
            ],
        ));
        let good = Arc::new(MockProvider::new(
            "good",
            [(("SUI", 1_000), Ok(2_000)), (("USDC", 2_000), Ok(1_020))],
        ));

        let report = Scanner::new(vec![bad, good], config())
            .scan()
            .await
            .expect("scan succeeds");

        assert_eq!(report.candidates.len(), 1);
        assert_eq!(report.failures.len(), 2);
        assert!(report.has_complete_round_trip());
    }

    #[test]
    fn scanner_serializes_atomic_values_as_strings() {
        let value = serde_json::to_value(ScanReport {
            schema_version: 1,
            observed_at_ms: 1,
            base_coin: "SUI".to_owned(),
            quote_coin: "USDC".to_owned(),
            amount_in: u128::MAX,
            gas_cost: 1,
            min_profit_bps: -1,
            candidates: Vec::new(),
            failures: Vec::new(),
        })
        .expect("serializes");

        assert_eq!(value["amount_in"], u128::MAX.to_string());
        assert_eq!(value["min_profit_bps"], "-1");
    }
}
