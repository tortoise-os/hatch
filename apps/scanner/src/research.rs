use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

use crate::{Opportunity, ScanReport};

pub const USD_NOTIONAL_TARGETS: [u64; 6] = [100, 500, 1_000, 5_000, 10_000, 25_000];
pub const ONE_SUI_MIST: u128 = 1_000_000_000;
pub const ONE_USDC_ATOMIC: u128 = 1_000_000;
pub const MIN_PLAUSIBLE_SUI_USDC_ATOMIC: u128 = 10_000;
pub const MAX_PLAUSIBLE_SUI_USDC_ATOMIC: u128 = 100_000_000;
pub const USDC: &str =
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
pub const USDT: &str =
    "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN";
pub const USDSUI: &str =
    "0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI";
pub const XBTC: &str =
    "0x876a4b7bce8aeaef60464c11f4026903e9afacab79b9b142686158aa86560b50::xbtc::XBTC";
pub const WBTC: &str =
    "0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC";
pub const ETH: &str =
    "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH";
pub const MAX_AMOUNTS: usize = 12;
pub const MAX_MARKETS: usize = 12;
pub const CONFIRMATION_RUNS: usize = 3;
pub const MIN_CONFIRMATIONS: usize = 2;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarketDefinition {
    pub symbol: String,
    #[serde(default = "legacy_base_coin")]
    pub base_coin: String,
    #[serde(default = "legacy_base_symbol")]
    pub base_symbol: String,
    #[serde(default = "legacy_base_decimals")]
    pub base_decimals: u8,
    pub coin_type: String,
    #[serde(default)]
    pub quote_symbol: String,
    pub decimals: u8,
    pub enabled: bool,
    #[serde(default)]
    pub watchlist_only: bool,
}

fn legacy_base_coin() -> String {
    crate::app::SUI.to_owned()
}

fn legacy_base_symbol() -> String {
    "SUI".to_owned()
}

const fn legacy_base_decimals() -> u8 {
    9
}

impl MarketDefinition {
    #[must_use]
    pub fn resolved_quote_symbol(&self) -> &str {
        if self.quote_symbol.is_empty() {
            &self.symbol
        } else {
            &self.quote_symbol
        }
    }

    #[must_use]
    pub const fn scannable(&self) -> bool {
        self.enabled && !self.watchlist_only
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AdaptiveSizingEvidence {
    pub quote_coin: String,
    #[serde(with = "crate::model::u128_string")]
    pub reference_amount_in: u128,
    #[serde(with = "crate::model::u128_string")]
    pub usdc_per_sui_atomic: u128,
    pub providers: Vec<String>,
    pub usd_targets: Vec<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarketSizingEvidence {
    pub market_symbol: String,
    pub base_coin: String,
    pub base_symbol: String,
    pub base_decimals: u8,
    pub quote_coin: String,
    pub quote_symbol: String,
    pub quote_decimals: u8,
    #[serde(with = "crate::model::u128_string")]
    pub reference_amount_in: u128,
    #[serde(with = "crate::model::u128_string")]
    pub usdc_per_base_atomic: u128,
    pub providers: Vec<String>,
    pub usd_targets: Vec<u64>,
    #[serde(with = "crate::model::u128_vec_string")]
    pub amounts: Vec<u128>,
    #[serde(with = "crate::model::u128_string")]
    pub gas_cost_base: u128,
}

pub fn atomic_unit(decimals: u8) -> Result<u128, &'static str> {
    10_u128
        .checked_pow(u32::from(decimals))
        .ok_or("coin decimal scale overflowed")
}

pub fn usd_normalized_amounts(
    usdc_per_base_atomic: u128,
    base_unit: u128,
) -> Result<Vec<u128>, &'static str> {
    if usdc_per_base_atomic == 0 || base_unit == 0 {
        return Err("USD calibration and base unit must be greater than zero");
    }

    USD_NOTIONAL_TARGETS
        .into_iter()
        .map(|usd| {
            u128::from(usd)
                .checked_mul(ONE_USDC_ATOMIC)
                .and_then(|value| value.checked_mul(base_unit))
                .and_then(|value| value.checked_add(usdc_per_base_atomic / 2))
                .map(|value| value / usdc_per_base_atomic)
                .ok_or("USD-normalized base amount overflowed")
        })
        .collect()
}

pub fn convert_sui_gas_to_base(
    gas_mist: u128,
    sui_usdc_atomic: u128,
    usdc_per_base_atomic: u128,
    base_unit: u128,
) -> Result<u128, &'static str> {
    let denominator = ONE_SUI_MIST
        .checked_mul(usdc_per_base_atomic)
        .ok_or("gas conversion denominator overflowed")?;
    let numerator = gas_mist
        .checked_mul(sui_usdc_atomic)
        .and_then(|value| value.checked_mul(base_unit))
        .ok_or("gas conversion numerator overflowed")?;
    numerator
        .checked_add(denominator.saturating_sub(1))
        .map(|value| value / denominator)
        .ok_or("gas conversion rounding overflowed")
}

pub fn usd_normalized_sui_amounts(usdc_per_sui_atomic: u128) -> Result<Vec<u128>, &'static str> {
    if !(MIN_PLAUSIBLE_SUI_USDC_ATOMIC..=MAX_PLAUSIBLE_SUI_USDC_ATOMIC)
        .contains(&usdc_per_sui_atomic)
    {
        return Err("SUI/USDC calibration price is outside plausible bounds");
    }

    usd_normalized_amounts(usdc_per_sui_atomic, ONE_SUI_MIST)
}

#[must_use]
pub fn default_market_registry() -> Vec<MarketDefinition> {
    vec![
        market("USDC/USDT", USDC, "USDC", 6, USDT, "USDT", 6, false),
        market(
            "SUI/USDC",
            crate::app::SUI,
            "SUI",
            9,
            USDC,
            "USDC",
            6,
            false,
        ),
        market("USDC/USDSUI", USDC, "USDC", 6, USDSUI, "USDSUI", 6, false),
        market("USDC/xBTC", USDC, "USDC", 6, XBTC, "xBTC", 8, false),
        market("xBTC/WBTC", XBTC, "xBTC", 8, WBTC, "WBTC", 8, false),
        market("USDC/ETH", USDC, "USDC", 6, ETH, "ETH", 8, true),
    ]
}

#[allow(clippy::too_many_arguments)]
fn market(
    symbol: &str,
    base_coin: &str,
    base_symbol: &str,
    base_decimals: u8,
    quote_coin: &str,
    quote_symbol: &str,
    quote_decimals: u8,
    watchlist_only: bool,
) -> MarketDefinition {
    MarketDefinition {
        symbol: symbol.to_owned(),
        base_coin: base_coin.to_owned(),
        base_symbol: base_symbol.to_owned(),
        base_decimals,
        coin_type: quote_coin.to_owned(),
        quote_symbol: quote_symbol.to_owned(),
        decimals: quote_decimals,
        enabled: !watchlist_only,
        watchlist_only,
    }
}

pub fn validate_market_registry(markets: &[MarketDefinition]) -> Result<(), &'static str> {
    if markets.is_empty() {
        return Err("market registry must not be empty");
    }
    if markets.iter().any(|market| {
        market.symbol.trim().is_empty()
            || market.base_coin.trim().is_empty()
            || market.base_symbol.trim().is_empty()
            || market.coin_type.trim().is_empty()
            || market.resolved_quote_symbol().trim().is_empty()
    }) {
        return Err("market identity fields must not be empty");
    }
    if markets
        .iter()
        .any(|market| market.base_coin == market.coin_type)
    {
        return Err("market base and quote coin must differ");
    }
    if markets
        .iter()
        .any(|market| market.enabled && market.watchlist_only)
    {
        return Err("watchlist-only markets must not be enabled");
    }
    let unique = markets
        .iter()
        .map(|market| (market.base_coin.trim(), market.coin_type.trim()))
        .collect::<std::collections::BTreeSet<_>>();
    if unique.len() != markets.len() {
        return Err("market pairs must not contain duplicates");
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfirmedOpportunity {
    pub validation_tier: String,
    pub simulation_status: String,
    #[serde(default)]
    pub simulation: Option<crate::simulation::AtomicSimulationEvidence>,
    pub route_fingerprint: String,
    #[serde(with = "crate::model::u128_string")]
    pub amount_in: u128,
    #[serde(default = "legacy_base_coin")]
    pub base_coin: String,
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
    #[serde(default)]
    pub market_metadata: Vec<MarketDefinition>,
    #[serde(default)]
    pub adaptive_sizing: Option<AdaptiveSizingEvidence>,
    #[serde(default)]
    pub market_sizing: Vec<MarketSizingEvidence>,
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
    let mut samples_by_market_amount: HashMap<(String, String, u128), usize> = HashMap::new();
    let mut groups: BTreeMap<(String, String, u128, String), Vec<&Opportunity>> = BTreeMap::new();

    for report in reports {
        *samples_by_market_amount
            .entry((
                report.base_coin.clone(),
                report.quote_coin.clone(),
                report.amount_in,
            ))
            .or_default() += 1;
        let mut candidates_in_sample = BTreeMap::new();
        for candidate in report.opportunities() {
            let fingerprint = fingerprint(candidate);
            candidates_in_sample
                .entry(fingerprint)
                .and_modify(|current: &mut &Opportunity| {
                    if candidate.net_profit < current.net_profit {
                        *current = candidate;
                    }
                })
                .or_insert(candidate);
        }
        for (fingerprint, candidate) in candidates_in_sample {
            groups
                .entry((
                    report.base_coin.clone(),
                    report.quote_coin.clone(),
                    report.amount_in,
                    fingerprint,
                ))
                .or_default()
                .push(candidate);
        }
    }

    let mut confirmed: Vec<_> = groups
        .into_iter()
        .filter_map(
            |((base_coin, quote_coin, amount_in, route_fingerprint), candidates)| {
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
                    simulation: None,
                    route_fingerprint,
                    amount_in,
                    base_coin: base_coin.clone(),
                    quote_coin: quote_coin.clone(),
                    confirmations: candidates.len(),
                    samples: samples_by_market_amount
                        .get(&(base_coin, quote_coin, amount_in))
                        .copied()
                        .unwrap_or_default(),
                    worst_net_profit,
                    best_net_profit,
                    max_quote_skew_ms,
                    representative,
                })
            },
        )
        .collect();
    confirmed.sort_by(|left, right| {
        right
            .worst_net_profit
            .cmp(&left.worst_net_profit)
            .then_with(|| left.route_fingerprint.cmp(&right.route_fingerprint))
    });
    confirmed
}

#[must_use]
pub fn positive_market_amount_pairs(
    reports: &[ScanReport],
) -> BTreeMap<(String, String, u128), usize> {
    let mut pairs = BTreeMap::new();
    for report in reports {
        if report.opportunities().next().is_some() {
            *pairs
                .entry((
                    report.base_coin.clone(),
                    report.quote_coin.clone(),
                    report.amount_in,
                ))
                .or_default() += 1;
        }
    }
    pairs
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

    #[test]
    fn duplicate_candidates_in_one_sample_do_not_count_as_confirmations() {
        let mut single_sample = report("reverse", 10);
        single_sample
            .candidates
            .push(single_sample.candidates[0].clone());

        assert!(confirm_opportunities(&[single_sample], 2).is_empty());
    }

    #[test]
    fn fingerprint_preserves_provider_direction_and_pool_order() {
        let original = report("reverse", 10).candidates.remove(0);
        let mut shared_vector = original.clone();
        shared_vector.forward.provider = "seven_k:cetus".to_owned();
        shared_vector.reverse.provider = "seven_k:turbos".to_owned();
        shared_vector.forward.route[0].pool_id = "forward-pool".to_owned();
        shared_vector.reverse.route[0].pool_id = "reverse-pool".to_owned();
        assert_eq!(fingerprint(&shared_vector), "073049580c2adcaf");

        let mut changed_provider = original.clone();
        changed_provider.reverse.provider = "gamma".to_owned();
        assert_ne!(fingerprint(&original), fingerprint(&changed_provider));

        let mut changed_order = original.clone();
        changed_order.forward.route.push(RouteHop {
            route_index: 0,
            venue: "alpha".to_owned(),
            pool_id: "second".to_owned(),
            coin_in: "A".to_owned(),
            coin_out: "B".to_owned(),
        });
        let ordered = fingerprint(&changed_order);
        changed_order.forward.route.swap(0, 1);
        assert_ne!(ordered, fingerprint(&changed_order));
    }

    #[test]
    fn registry_rejects_duplicate_and_empty_coin_types() {
        let mut markets = default_market_registry();
        assert!(validate_market_registry(&markets).is_ok());

        let duplicate_base = markets[0].base_coin.clone();
        let duplicate_quote = markets[0].coin_type.clone();
        markets[1].base_coin = duplicate_base;
        markets[1].coin_type = duplicate_quote;
        assert_eq!(
            validate_market_registry(&markets),
            Err("market pairs must not contain duplicates")
        );

        markets[1].coin_type.clear();
        assert_eq!(
            validate_market_registry(&markets),
            Err("market identity fields must not be empty")
        );
    }

    #[test]
    fn default_registry_contains_required_verified_metadata() {
        let markets = default_market_registry();
        assert_eq!(
            markets
                .iter()
                .map(|market| market.symbol.as_str())
                .collect::<Vec<_>>(),
            [
                "USDC/USDT",
                "SUI/USDC",
                "USDC/USDSUI",
                "USDC/xBTC",
                "xBTC/WBTC",
                "USDC/ETH",
            ]
        );
        assert_eq!(
            markets
                .iter()
                .map(|market| market.decimals)
                .collect::<Vec<_>>(),
            [6, 6, 6, 8, 8, 8]
        );
        assert_eq!(
            markets.iter().filter(|market| market.scannable()).count(),
            5
        );
        assert_eq!(
            markets
                .iter()
                .filter(|market| market.watchlist_only)
                .count(),
            1
        );
        assert_eq!(
            markets.last().map(|market| market.symbol.as_str()),
            Some("USDC/ETH")
        );
        assert_eq!(
            markets.iter().filter(|market| market.scannable()).count() * USD_NOTIONAL_TARGETS.len(),
            30
        );
    }

    #[test]
    fn usd_normalized_ladder_tracks_live_sui_price() {
        let one_dollar_sui = usd_normalized_sui_amounts(1_000_000).unwrap();
        assert_eq!(
            one_dollar_sui,
            [
                100_000_000_000,
                500_000_000_000,
                1_000_000_000_000,
                5_000_000_000_000,
                10_000_000_000_000,
                25_000_000_000_000,
            ]
        );

        let current_price_shape = usd_normalized_sui_amounts(740_741).unwrap();
        assert!((134_000_000_000..=136_000_000_000).contains(&current_price_shape[0]));
        assert!((33_749_000_000_000..=33_751_000_000_000).contains(&current_price_shape[5]));
        assert!(current_price_shape.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn usd_normalized_ladder_rejects_implausible_calibration() {
        assert!(usd_normalized_sui_amounts(0).is_err());
        assert!(usd_normalized_sui_amounts(100_000_001).is_err());
    }

    #[test]
    fn gas_conversion_keeps_units_comparable() {
        assert_eq!(
            convert_sui_gas_to_base(2_000_000, 728_451, 728_451, ONE_SUI_MIST).unwrap(),
            2_000_000
        );
        assert_eq!(
            convert_sui_gas_to_base(2_000_000, 728_451, ONE_USDC_ATOMIC, 1_000_000).unwrap(),
            1_457
        );
        assert_eq!(
            convert_sui_gas_to_base(2_000_000, 728_451, 77_000_000_000, 100_000_000).unwrap(),
            2
        );
    }

    #[test]
    fn legacy_market_defaults_to_sui_base() {
        let market: MarketDefinition = serde_json::from_str(
            r#"{"symbol":"USDC","coin_type":"coin","decimals":6,"enabled":true}"#,
        )
        .unwrap();
        assert_eq!(market.base_coin, crate::app::SUI);
        assert_eq!(market.base_symbol, "SUI");
        assert_eq!(market.base_decimals, 9);
        assert_eq!(market.resolved_quote_symbol(), "USDC");
        assert!(!market.watchlist_only);
    }

    #[test]
    fn only_positive_discovery_pairs_advance() {
        let positive = report("positive", 10);
        let mut rejected = report("negative", -10);
        rejected.quote_coin = "C".to_owned();
        rejected.amount_in = 2_000;
        rejected.candidates[0].meets_threshold = false;
        let pairs = positive_market_amount_pairs(&[positive, rejected]);
        assert_eq!(pairs.len(), 1);
        assert_eq!(
            pairs.get(&("A".to_owned(), "B".to_owned(), 1_000)),
            Some(&1)
        );
    }
}
