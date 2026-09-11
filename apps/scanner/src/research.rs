use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

use crate::{Opportunity, ScanReport};

pub const DEFAULT_AMOUNTS: [u128; 8] = [
    100_000_000,
    250_000_000,
    500_000_000,
    1_000_000_000,
    2_000_000_000,
    5_000_000_000,
    10_000_000_000,
    25_000_000_000,
];
pub const DEFAULT_MARKETS: [&str; 6] = [
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
    "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
    "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
    "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
    "0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2::buck::BUCK",
];
pub const MAX_AMOUNTS: usize = 12;
pub const MAX_MARKETS: usize = 12;
pub const CONFIRMATION_RUNS: usize = 3;
pub const MIN_CONFIRMATIONS: usize = 2;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfirmedOpportunity {
    pub validation_tier: String,
    pub simulation_status: String,
    pub route_fingerprint: String,
    #[serde(with = "crate::model::u128_string")]
    pub amount_in: u128,
    pub quote_coin: String,
    pub confirmations: usize,
    pub samples: usize,
    #[serde(with = "crate::model::i128_string")]
    pub worst_net_profit: i128,
    #[serde(with = "crate::model::i128_string")]
    pub best_net_profit: i128,
    pub max_quote_skew_ms: u64,
    pub representative: Opportunity,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResearchReport {
    pub schema_version: u8,
    pub observed_at_ms: u64,
    #[serde(with = "crate::model::u128_vec_string")]
    pub amounts_tested: Vec<u128>,
    pub markets_tested: Vec<String>,
    pub routes_evaluated: usize,
    pub provider_failures: usize,
    pub confirmation_runs: usize,
    #[serde(default)]
    pub discovery_reports: usize,
    #[serde(default)]
    pub venue_isolated_reports: usize,
    #[serde(default)]
    pub venues_tested: Vec<String>,
    pub opportunities: Vec<ConfirmedOpportunity>,
    pub reports: Vec<ScanReport>,
}

#[must_use]
pub fn confirm_opportunities(
    reports: &[ScanReport],
    minimum_confirmations: usize,
) -> Vec<ConfirmedOpportunity> {
    let mut samples_by_market_amount: HashMap<(String, u128), usize> = HashMap::new();
    let mut groups: BTreeMap<(String, u128, String), Vec<&Opportunity>> = BTreeMap::new();

    for report in reports {
        *samples_by_market_amount
            .entry((report.quote_coin.clone(), report.amount_in))
            .or_default() += 1;
        for candidate in report.opportunities() {
            let fingerprint = fingerprint(candidate);
            groups
                .entry((report.quote_coin.clone(), report.amount_in, fingerprint))
                .or_default()
                .push(candidate);
        }
    }

    let mut confirmed: Vec<_> = groups
        .into_iter()
        .filter_map(|((quote_coin, amount_in, route_fingerprint), candidates)| {
            if candidates.len() < minimum_confirmations {
                return None;
            }
            let representative = (*candidates.last()?).clone();
            let worst_net_profit = candidates.iter().map(|item| item.net_profit).min()?;
            let best_net_profit = candidates.iter().map(|item| item.net_profit).max()?;
            let max_quote_skew_ms = candidates
                .iter()
                .map(|item| item.quote_skew_ms)
                .max()
                .unwrap_or_default();
            Some(ConfirmedOpportunity {
                validation_tier: "venue_isolated_quote_confirmed".to_owned(),
                simulation_status: "pending".to_owned(),
                route_fingerprint,
                amount_in,
                quote_coin: quote_coin.clone(),
                confirmations: candidates.len(),
                samples: samples_by_market_amount
                    .get(&(quote_coin, amount_in))
                    .copied()
                    .unwrap_or_default(),
                worst_net_profit,
                best_net_profit,
                max_quote_skew_ms,
                representative,
            })
        })
        .collect();
    confirmed.sort_by(|left, right| {
        right
            .worst_net_profit
            .cmp(&left.worst_net_profit)
            .then_with(|| left.route_fingerprint.cmp(&right.route_fingerprint))
    });
    confirmed
}

fn fingerprint(candidate: &Opportunity) -> String {
    let mut value = format!(
        "{}>{}",
        candidate.forward.provider, candidate.reverse.provider
    );
    for hop in &candidate.forward.route {
        value.push('|');
        value.push_str(&hop.pool_id);
    }
    value.push_str("||");
    for hop in &candidate.reverse.route {
        value.push('|');
        value.push_str(&hop.pool_id);
    }
    let hash = value
        .as_bytes()
        .iter()
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
        });
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Quote, RouteHop};

    fn quote(provider: &str, pool: &str) -> Quote {
        Quote {
            provider: provider.to_owned(),
            coin_in: "A".to_owned(),
            coin_out: "B".to_owned(),
            amount_in: 1_000,
            amount_out: 1_020,
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
        }
    }

    fn report(reverse_pool: &str, net_profit: i128) -> ScanReport {
        ScanReport {
            schema_version: 1,
            observed_at_ms: 1,
            base_coin: "A".to_owned(),
            quote_coin: "B".to_owned(),
            amount_in: 1_000,
            gas_cost: 10,
            min_profit_bps: 1,
            candidates: vec![Opportunity {
                forward: quote("alpha", "forward"),
                reverse: quote("beta", reverse_pool),
                same_quote_provider: false,
                shared_pool_ids: Vec::new(),
                returned_base: 1_000_u128.saturating_add_signed(net_profit + 10),
                gross_profit: net_profit + 10,
                gas_cost: 10,
                net_profit,
                net_profit_bps: 10,
                quote_skew_ms: 10,
                rejection_reasons: Vec::new(),
                meets_threshold: true,
            }],
            failures: Vec::new(),
        }
    }

    #[test]
    fn confirms_only_repeated_route_fingerprints() {
        let reports = [
            report("stable", 12),
            report("stable", 8),
            report("changed", 20),
        ];
        let confirmed = confirm_opportunities(&reports, 2);

        assert_eq!(confirmed.len(), 1);
        assert_eq!(confirmed[0].confirmations, 2);
        assert_eq!(confirmed[0].samples, 3);
        assert_eq!(confirmed[0].worst_net_profit, 8);
        assert_eq!(confirmed[0].best_net_profit, 12);
    }
}
