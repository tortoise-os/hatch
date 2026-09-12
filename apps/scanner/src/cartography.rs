use std::collections::BTreeMap;

use serde::Serialize;

use crate::{Opportunity, ResearchReport};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CartographyCell {
    pub base_coin: String,
    pub base_symbol: String,
    pub base_decimals: u8,
    pub quote_coin: String,
    pub quote_symbol: String,
    pub quote_decimals: u8,
    pub market_symbol: String,
    pub evidence_tier: String,
    pub forward_venues: String,
    pub reverse_venues: String,
    pub observed_round_trips: usize,
    pub positive_quotes: usize,
    pub positive_rate_bps: usize,
    pub confirmed_signals: usize,
    pub confirmation_hits: usize,
    pub confirmation_samples: usize,
    pub best_net_profit: String,
    pub worst_net_profit: String,
    pub best_amount_in: String,
    pub last_observed_at_ms: u64,
    pub simulation_status: String,
    pub simulation_attempts: usize,
    pub positive_simulations: usize,
    pub simulation_survival_rate_bps: usize,
    pub median_observed_half_life_ms: Option<u64>,
    pub best_simulated_delta: String,
    pub measured_gas_cost: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CartographyReport {
    pub schema_version: u8,
    pub generated_at_ms: u64,
    pub research_runs: usize,
    pub scan_reports: usize,
    pub observed_round_trips: usize,
    pub confirmed_signals: usize,
    pub simulation_confirmed_signals: usize,
    pub journal_rejected_lines: usize,
    pub cells: Vec<CartographyCell>,
    pub rejection_reasons: BTreeMap<String, usize>,
}

#[derive(Debug)]
struct CellAccumulator {
    cell: CartographyCell,
    best_net_profit: i128,
    worst_net_profit: i128,
    best_simulated_delta: Option<i128>,
    half_lives: Vec<u64>,
}

fn simulation_status_rank(status: &str) -> u8 {
    match status {
        "simulation_confirmed" => 4,
        "simulation_non_positive" => 3,
        "fingerprint_mismatch" => 2,
        "simulation_failed" | "unsupported_base" => 1,
        _ => 0,
    }
}

#[must_use]
pub fn build_cartography(
    reports: &[ResearchReport],
    generated_at_ms: u64,
    journal_rejected_lines: usize,
) -> CartographyReport {
    let mut cells: BTreeMap<(String, String, String, String, String), CellAccumulator> =
        BTreeMap::new();
    let mut rejection_reasons = BTreeMap::new();
    let mut scan_reports = 0;
    let mut observed_round_trips = 0;
    let mut simulation_confirmed_signals = 0;

    for research in reports {
        scan_reports += research.reports.len();
        for report in &research.reports {
            for candidate in &report.candidates {
                observed_round_trips += 1;
                for reason in &candidate.rejection_reasons {
                    *rejection_reasons.entry(reason.clone()).or_default() += 1;
                }
                let evidence_tier = evidence_tier(candidate);
                let forward_venues = venue_path(candidate, true);
                let reverse_venues = venue_path(candidate, false);
                let key = (
                    report.base_coin.clone(),
                    report.quote_coin.clone(),
                    evidence_tier.clone(),
                    forward_venues.clone(),
                    reverse_venues.clone(),
                );
                let metadata = market_metadata(research, &report.base_coin, &report.quote_coin);
                let entry = cells.entry(key).or_insert_with(|| CellAccumulator {
                    cell: CartographyCell {
                        base_coin: report.base_coin.clone(),
                        base_symbol: metadata.base_symbol,
                        base_decimals: metadata.base_decimals,
                        quote_coin: report.quote_coin.clone(),
                        quote_symbol: metadata.quote_symbol,
                        quote_decimals: metadata.quote_decimals,
                        market_symbol: metadata.market_symbol,
                        evidence_tier,
                        forward_venues,
                        reverse_venues,
                        observed_round_trips: 0,
                        positive_quotes: 0,
                        positive_rate_bps: 0,
                        confirmed_signals: 0,
                        confirmation_hits: 0,
                        confirmation_samples: 0,
                        best_net_profit: String::new(),
                        worst_net_profit: String::new(),
                        best_amount_in: report.amount_in.to_string(),
                        last_observed_at_ms: report.observed_at_ms,
                        simulation_status: "pending".to_owned(),
                        simulation_attempts: 0,
                        positive_simulations: 0,
                        simulation_survival_rate_bps: 0,
                        median_observed_half_life_ms: None,
                        best_simulated_delta: "0".to_owned(),
                        measured_gas_cost: "0".to_owned(),
                    },
                    best_net_profit: candidate.net_profit,
                    worst_net_profit: candidate.net_profit,
                    best_simulated_delta: None,
                    half_lives: Vec::new(),
                });
                entry.cell.observed_round_trips += 1;
                entry.cell.positive_quotes += usize::from(candidate.meets_threshold);
                if candidate.net_profit > entry.best_net_profit {
                    entry.best_net_profit = candidate.net_profit;
                    entry.cell.best_amount_in = report.amount_in.to_string();
                }
                entry.worst_net_profit = entry.worst_net_profit.min(candidate.net_profit);
                entry.cell.last_observed_at_ms =
                    entry.cell.last_observed_at_ms.max(report.observed_at_ms);
            }
        }

        for opportunity in &research.opportunities {
            simulation_confirmed_signals +=
                usize::from(opportunity.simulation_status == "simulation_confirmed");
            let candidate = &opportunity.representative;
            let key = (
                opportunity.base_coin.clone(),
                opportunity.quote_coin.clone(),
                evidence_tier(candidate),
                venue_path(candidate, true),
                venue_path(candidate, false),
            );
            if let Some(entry) = cells.get_mut(&key) {
                entry.cell.confirmed_signals += 1;
                entry.cell.confirmation_hits += opportunity.confirmations;
                entry.cell.confirmation_samples += opportunity.samples;
                if simulation_status_rank(&opportunity.simulation_status)
                    > simulation_status_rank(&entry.cell.simulation_status)
                {
                    entry.cell.simulation_status = opportunity.simulation_status.clone();
                }
                if let Some(simulation) = &opportunity.simulation {
                    entry.cell.simulation_attempts += simulation.attempts;
                    entry.cell.positive_simulations += simulation.confirmation_count;
                    if entry
                        .best_simulated_delta
                        .is_none_or(|current| simulation.balance_delta > current)
                    {
                        entry.best_simulated_delta = Some(simulation.balance_delta);
                        entry.cell.measured_gas_cost = simulation.measured_gas_cost.to_string();
                    }
                    if let Some(half_life) = simulation.elapsed_half_life_ms {
                        entry.half_lives.push(half_life);
                    }
                }
            }
        }
    }

    let mut cells: Vec<_> = cells
        .into_values()
        .map(|mut entry| {
            entry.cell.positive_rate_bps = entry
                .cell
                .positive_quotes
                .saturating_mul(10_000)
                .checked_div(entry.cell.observed_round_trips)
                .unwrap_or_default();
            entry.cell.best_net_profit = entry.best_net_profit.to_string();
            entry.cell.worst_net_profit = entry.worst_net_profit.to_string();
            entry.cell.simulation_survival_rate_bps = entry
                .cell
                .positive_simulations
                .saturating_mul(10_000)
                .checked_div(entry.cell.simulation_attempts)
                .unwrap_or_default();
            entry.half_lives.sort_unstable();
            entry.cell.median_observed_half_life_ms = if entry.half_lives.is_empty() {
                None
            } else {
                Some(entry.half_lives[entry.half_lives.len() / 2])
            };
            entry.cell.best_simulated_delta =
                entry.best_simulated_delta.unwrap_or_default().to_string();
            entry.cell
        })
        .collect();
    cells.sort_by(|left, right| {
        let left_isolated = usize::from(left.evidence_tier == "venue_isolated");
        let right_isolated = usize::from(right.evidence_tier == "venue_isolated");
        right_isolated
            .cmp(&left_isolated)
            .then_with(|| right.confirmed_signals.cmp(&left.confirmed_signals))
            .then_with(|| right.positive_rate_bps.cmp(&left.positive_rate_bps))
            .then_with(|| {
                right
                    .best_net_profit
                    .parse::<i128>()
                    .unwrap_or_default()
                    .cmp(&left.best_net_profit.parse::<i128>().unwrap_or_default())
            })
    });
    let confirmed_signals = cells.iter().map(|cell| cell.confirmed_signals).sum();
    CartographyReport {
        schema_version: 3,
        generated_at_ms,
        research_runs: reports.len(),
        scan_reports,
        observed_round_trips,
        confirmed_signals,
        simulation_confirmed_signals,
        journal_rejected_lines,
        cells,
        rejection_reasons,
    }
}

fn evidence_tier(candidate: &Opportunity) -> String {
    if candidate.forward.provider.starts_with("seven_k:")
        && candidate.reverse.provider.starts_with("seven_k:")
    {
        "venue_isolated".to_owned()
    } else {
        "aggregator_discovery".to_owned()
    }
}

fn venue_path(candidate: &Opportunity, forward: bool) -> String {
    let quote = if forward {
        &candidate.forward
    } else {
        &candidate.reverse
    };
    let mut branches: BTreeMap<usize, Vec<&str>> = BTreeMap::new();
    for hop in &quote.route {
        branches
            .entry(hop.route_index)
            .or_default()
            .push(hop.venue.as_str());
    }
    if branches.is_empty() {
        quote.provider.clone()
    } else {
        branches
            .into_values()
            .map(|venues| venues.join(" → "))
            .collect::<Vec<_>>()
            .join(" | ")
    }
}

struct ResolvedMarketMetadata {
    market_symbol: String,
    base_symbol: String,
    base_decimals: u8,
    quote_symbol: String,
    quote_decimals: u8,
}

fn market_metadata(
    research: &ResearchReport,
    base_coin: &str,
    quote_coin: &str,
) -> ResolvedMarketMetadata {
    if let Some(market) = research
        .market_metadata
        .iter()
        .find(|market| market.base_coin == base_coin && market.coin_type == quote_coin)
    {
        return ResolvedMarketMetadata {
            market_symbol: market.symbol.clone(),
            base_symbol: market.base_symbol.clone(),
            base_decimals: market.base_decimals,
            quote_symbol: market.resolved_quote_symbol().to_owned(),
            quote_decimals: market.decimals,
        };
    }
    let base_symbol = base_coin
        .rsplit("::")
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or(base_coin)
        .to_owned();
    let quote_symbol = if quote_coin.contains("0xc0600061") {
        "USDT".to_owned()
    } else {
        quote_coin
            .rsplit("::")
            .next()
            .filter(|value| !value.is_empty())
            .unwrap_or(quote_coin)
            .to_owned()
    };
    ResolvedMarketMetadata {
        market_symbol: format!("{base_symbol}/{quote_symbol}"),
        base_symbol,
        base_decimals: 9,
        quote_symbol,
        quote_decimals: 9,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        AtomicSimulationEvidence, AtomicSimulationResult, ConfirmedOpportunity, Quote, RouteHop,
        ScanReport,
    };

    fn quote(provider: &str, venue: &str, pool: &str) -> Quote {
        Quote {
            provider: provider.to_owned(),
            coin_in: "A".to_owned(),
            coin_out: "B".to_owned(),
            amount_in: 1_000,
            amount_out: 1_010,
            quote_id: None,
            route: vec![RouteHop {
                route_index: 0,
                venue: venue.to_owned(),
                pool_id: pool.to_owned(),
                coin_in: "A".to_owned(),
                coin_out: "B".to_owned(),
            }],
            estimated_gas_cost: None,
            observed_at_ms: 1,
            latency_ms: 1,
        }
    }

    fn candidate(net_profit: i128, meets_threshold: bool) -> Opportunity {
        Opportunity {
            forward: quote("seven_k:cetus", "cetus", "cetus-pool"),
            reverse: quote("seven_k:turbos", "turbos", "turbos-pool"),
            same_quote_provider: false,
            shared_pool_ids: Vec::new(),
            returned_base: 1_000_u128.saturating_add_signed(net_profit),
            gross_profit: net_profit,
            gas_cost: 0,
            net_profit,
            net_profit_bps: net_profit * 10,
            quote_skew_ms: 1,
            rejection_reasons: if meets_threshold {
                Vec::new()
            } else {
                vec!["not_positive_after_gas_reserve".to_owned()]
            },
            meets_threshold,
        }
    }

    #[test]
    fn groups_directional_venue_evidence_and_confirmation_rates() {
        let positive = candidate(10, true);
        let research = ResearchReport {
            schema_version: 3,
            observed_at_ms: 2,
            amounts_tested: vec![1_000],
            markets_tested: vec!["package::coin::TEST".to_owned()],
            market_metadata: Vec::new(),
            adaptive_sizing: None,
            market_sizing: Vec::new(),
            routes_evaluated: 2,
            provider_failures: 0,
            confirmation_runs: 3,
            discovery_reports: 0,
            venue_isolated_reports: 1,
            venues_tested: vec!["cetus".to_owned(), "turbos".to_owned()],
            opportunities: vec![ConfirmedOpportunity {
                validation_tier: "venue_isolated_quote_confirmed".to_owned(),
                simulation_status: "simulation_confirmed".to_owned(),
                simulation: Some(AtomicSimulationEvidence {
                    first_seen_at_ms: 10,
                    last_positive_at_ms: Some(16),
                    confirmation_count: 2,
                    attempts: 2,
                    elapsed_half_life_ms: Some(6),
                    measured_gas_cost: 7,
                    balance_delta: 3,
                    failure_reason: None,
                    results: vec![AtomicSimulationResult {
                        status: "positive".to_owned(),
                        route_fingerprint: "route".to_owned(),
                        rebuilt_route_fingerprint: Some("route".to_owned()),
                        observed_at_ms: 10,
                        measured_gas_cost: 7,
                        balance_delta: 3,
                        command_results: 5,
                        effects_requested: true,
                        balance_changes_requested: true,
                        command_results_requested: true,
                        command_trace: Vec::new(),
                        error: None,
                    }],
                }),
                route_fingerprint: "route".to_owned(),
                amount_in: 1_000,
                base_coin: "A".to_owned(),
                quote_coin: "package::coin::TEST".to_owned(),
                confirmations: 2,
                samples: 3,
                worst_net_profit: 8,
                best_net_profit: 10,
                max_quote_skew_ms: 1,
                representative: positive.clone(),
            }],
            reports: vec![ScanReport {
                schema_version: 1,
                observed_at_ms: 2,
                base_coin: "A".to_owned(),
                quote_coin: "package::coin::TEST".to_owned(),
                amount_in: 1_000,
                gas_cost: 0,
                min_profit_bps: 1,
                candidates: vec![positive, candidate(-5, false)],
                failures: Vec::new(),
            }],
        };

        let map = build_cartography(&[research], 3, 0);
        assert_eq!(map.cells.len(), 1);
        let cell = &map.cells[0];
        assert_eq!(cell.market_symbol, "A/TEST");
        assert_eq!(cell.evidence_tier, "venue_isolated");
        assert_eq!(cell.forward_venues, "cetus");
        assert_eq!(cell.reverse_venues, "turbos");
        assert_eq!(cell.observed_round_trips, 2);
        assert_eq!(cell.positive_quotes, 1);
        assert_eq!(cell.positive_rate_bps, 5_000);
        assert_eq!(cell.confirmed_signals, 1);
        assert_eq!(cell.confirmation_hits, 2);
        assert_eq!(cell.confirmation_samples, 3);
        assert_eq!(cell.simulation_status, "simulation_confirmed");
        assert_eq!(cell.simulation_attempts, 2);
        assert_eq!(cell.positive_simulations, 2);
        assert_eq!(cell.simulation_survival_rate_bps, 10_000);
        assert_eq!(cell.median_observed_half_life_ms, Some(6));
        assert_eq!(cell.best_simulated_delta, "3");
        assert_eq!(cell.measured_gas_cost, "7");
        assert_eq!(cell.best_net_profit, "10");
        assert_eq!(cell.worst_net_profit, "-5");
        assert_eq!(map.rejection_reasons["not_positive_after_gas_reserve"], 1);
    }

    #[test]
    fn isolated_confirmation_becomes_map_cell() {
        let reports: Vec<_> = (0..3)
            .map(|observed_at_ms| ScanReport {
                schema_version: 1,
                observed_at_ms,
                base_coin: "A".to_owned(),
                quote_coin: "package::coin::TEST".to_owned(),
                amount_in: 1_000,
                gas_cost: 0,
                min_profit_bps: 1,
                candidates: vec![candidate(10, true)],
                failures: Vec::new(),
            })
            .collect();
        let mut opportunities = crate::research::confirm_opportunities(&reports, 2);
        assert_eq!(opportunities.len(), 1);
        opportunities[0].simulation_status = "unsupported_base".to_owned();
        let research = ResearchReport {
            schema_version: 3,
            observed_at_ms: 3,
            amounts_tested: vec![1_000],
            markets_tested: vec!["package::coin::TEST".to_owned()],
            market_metadata: Vec::new(),
            adaptive_sizing: None,
            market_sizing: Vec::new(),
            routes_evaluated: 3,
            provider_failures: 0,
            confirmation_runs: 3,
            discovery_reports: 1,
            venue_isolated_reports: 3,
            venues_tested: vec!["cetus".to_owned(), "turbos".to_owned()],
            opportunities,
            reports,
        };

        let map = build_cartography(&[research], 4, 0);
        assert_eq!(map.cells.len(), 1);
        assert_eq!(map.cells[0].confirmed_signals, 1);
        assert_eq!(map.cells[0].confirmation_hits, 3);
        assert_eq!(map.cells[0].evidence_tier, "venue_isolated");
        assert_eq!(map.cells[0].simulation_status, "unsupported_base");
    }

    #[test]
    fn simulation_status_precedence_keeps_strongest_evidence() {
        assert!(
            simulation_status_rank("simulation_confirmed")
                > simulation_status_rank("simulation_non_positive")
        );
        assert!(
            simulation_status_rank("simulation_non_positive")
                > simulation_status_rank("fingerprint_mismatch")
        );
        assert!(
            simulation_status_rank("fingerprint_mismatch")
                > simulation_status_rank("simulation_failed")
        );
        assert!(simulation_status_rank("simulation_failed") > simulation_status_rank("pending"));
        assert!(simulation_status_rank("unsupported_base") > simulation_status_rank("pending"));
    }
}
