use std::collections::BTreeMap;

use serde::Serialize;

use crate::{Opportunity, ResearchReport};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CartographyCell {
    pub quote_coin: String,
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
    pub simulation_status: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CartographyReport {
    pub schema_version: u8,
    pub generated_at_ms: u64,
    pub research_runs: usize,
    pub scan_reports: usize,
    pub observed_round_trips: usize,
    pub confirmed_signals: usize,
    pub journal_rejected_lines: usize,
    pub cells: Vec<CartographyCell>,
    pub rejection_reasons: BTreeMap<String, usize>,
}

#[derive(Debug)]
struct CellAccumulator {
    cell: CartographyCell,
    best_net_profit: i128,
    worst_net_profit: i128,
}

#[must_use]
pub fn build_cartography(
    reports: &[ResearchReport],
    generated_at_ms: u64,
    journal_rejected_lines: usize,
) -> CartographyReport {
    let mut cells: BTreeMap<(String, String, String, String), CellAccumulator> = BTreeMap::new();
    let mut rejection_reasons = BTreeMap::new();
    let mut scan_reports = 0;
    let mut observed_round_trips = 0;

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
                    report.quote_coin.clone(),
                    evidence_tier.clone(),
                    forward_venues.clone(),
                    reverse_venues.clone(),
                );
                let entry = cells.entry(key).or_insert_with(|| CellAccumulator {
                    cell: CartographyCell {
                        quote_coin: report.quote_coin.clone(),
                        market_symbol: market_symbol(&report.quote_coin),
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
                        simulation_status: "pending",
                    },
                    best_net_profit: candidate.net_profit,
                    worst_net_profit: candidate.net_profit,
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
            let candidate = &opportunity.representative;
            let key = (
                opportunity.quote_coin.clone(),
                evidence_tier(candidate),
                venue_path(candidate, true),
                venue_path(candidate, false),
            );
            if let Some(entry) = cells.get_mut(&key) {
                entry.cell.confirmed_signals += 1;
                entry.cell.confirmation_hits += opportunity.confirmations;
                entry.cell.confirmation_samples += opportunity.samples;
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
        schema_version: 1,
        generated_at_ms,
        research_runs: reports.len(),
        scan_reports,
        observed_round_trips,
        confirmed_signals,
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

fn market_symbol(coin_type: &str) -> String {
    if coin_type.contains("0xc0600061") {
        return "USDT".to_owned();
    }
    coin_type
        .rsplit("::")
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or(coin_type)
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ConfirmedOpportunity, Quote, RouteHop, ScanReport};

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
            schema_version: 2,
            observed_at_ms: 2,
            amounts_tested: vec![1_000],
            markets_tested: vec!["package::coin::TEST".to_owned()],
            routes_evaluated: 2,
            provider_failures: 0,
            confirmation_runs: 3,
            discovery_reports: 0,
            venue_isolated_reports: 1,
            venues_tested: vec!["cetus".to_owned(), "turbos".to_owned()],
            opportunities: vec![ConfirmedOpportunity {
                validation_tier: "venue_isolated_quote_confirmed".to_owned(),
                simulation_status: "pending".to_owned(),
                route_fingerprint: "route".to_owned(),
                amount_in: 1_000,
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
        assert_eq!(cell.market_symbol, "TEST");
        assert_eq!(cell.evidence_tier, "venue_isolated");
        assert_eq!(cell.forward_venues, "cetus");
        assert_eq!(cell.reverse_venues, "turbos");
        assert_eq!(cell.observed_round_trips, 2);
        assert_eq!(cell.positive_quotes, 1);
        assert_eq!(cell.positive_rate_bps, 5_000);
        assert_eq!(cell.confirmed_signals, 1);
        assert_eq!(cell.confirmation_hits, 2);
        assert_eq!(cell.confirmation_samples, 3);
        assert_eq!(cell.best_net_profit, "10");
        assert_eq!(cell.worst_net_profit, "-5");
        assert_eq!(map.rejection_reasons["not_positive_after_gas_reserve"], 1);
    }
}
