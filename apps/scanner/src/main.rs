use std::{process::ExitCode, sync::Arc, time::Duration};

use clap::Parser;
use hatch_sui_scanner::{
    QuoteProvider, ScanConfig, Scanner,
    http::HttpClient,
    providers::{
        cetus::{CetusProvider, DEFAULT_ENDPOINT as CETUS_ENDPOINT},
        seven_k::{DEFAULT_ENDPOINT as SEVEN_K_ENDPOINT, SevenKProvider},
    },
};

const SUI: &str = "0x2::sui::SUI";
const NATIVE_USDC: &str =
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

#[derive(Debug, Parser)]
#[command(
    name = "hatch-sui-scanner",
    version,
    about = "Read-only Sui quote-surface arbitrage scanner"
)]
struct Cli {
    /// Base coin type. Profit and gas reserve use this coin's atomic units.
    #[arg(long, default_value = SUI)]
    base_coin: String,

    /// Intermediate quote coin type.
    #[arg(long, default_value = NATIVE_USDC)]
    quote_coin: String,

    /// Exact base-coin input in atomic units.
    #[arg(long, default_value_t = 1_000_000_000_u128)]
    amount: u128,

    /// Reserved round-trip gas in base-coin atomic units.
    #[arg(long, default_value_t = 10_000_000_u128)]
    gas_cost: u128,

    /// Minimum net return in basis points required to flag opportunity.
    #[arg(long, default_value_t = 0_i128)]
    min_profit_bps: i128,

    /// Per-request timeout.
    #[arg(long, default_value_t = 5_000_u64)]
    timeout_ms: u64,

    /// Retries after retryable timeout, rate-limit, or server failures.
    #[arg(long, default_value_t = 1_u32)]
    retries: u32,

    /// Cetus router endpoint. Override for testing or managed service access.
    #[arg(long, default_value = CETUS_ENDPOINT)]
    cetus_endpoint: String,

    /// Optional comma-separated Cetus route providers. Empty means all.
    #[arg(long, default_value = "")]
    cetus_sources: String,

    /// Bluefin/7K aggregator endpoint.
    #[arg(long, default_value = SEVEN_K_ENDPOINT)]
    seven_k_endpoint: String,

    /// Comma-separated Bluefin/7K liquidity sources.
    #[arg(
        long,
        default_value = "turbos,cetus,aftermath,deepbook_v3,flowx_v3,bluefin"
    )]
    seven_k_sources: String,
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli).await {
        Ok(has_round_trip) if has_round_trip => ExitCode::SUCCESS,
        Ok(_) => ExitCode::from(2),
        Err(error) => {
            eprintln!("scanner error: {error}");
            ExitCode::from(1)
        }
    }
}

async fn run(cli: Cli) -> Result<bool, Box<dyn std::error::Error>> {
    let http = HttpClient::new(Duration::from_millis(cli.timeout_ms))?;
    let seven_k_sources = split_sources(&cli.seven_k_sources);
    if seven_k_sources.is_empty() {
        return Err("--seven-k-sources must include at least one source".into());
    }
    let providers: Vec<Arc<dyn QuoteProvider>> = vec![
        Arc::new(CetusProvider::new(
            http.clone(),
            cli.cetus_endpoint,
            split_sources(&cli.cetus_sources),
        )),
        Arc::new(SevenKProvider::new(
            http,
            cli.seven_k_endpoint,
            seven_k_sources,
        )),
    ];
    let scanner = Scanner::new(
        providers,
        ScanConfig {
            base_coin: cli.base_coin,
            quote_coin: cli.quote_coin,
            amount_in: cli.amount,
            gas_cost: cli.gas_cost,
            min_profit_bps: cli.min_profit_bps,
            retries: cli.retries,
        },
    );
    let report = scanner.scan().await?;
    let has_round_trip = report.has_complete_round_trip();
    println!("{}", serde_json::to_string(&report)?);
    Ok(has_round_trip)
}

fn split_sources(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|source| !source.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_seven_k_sources_match_supported_subset() {
        let cli = Cli::parse_from(["scanner"]);
        let actual = split_sources(&cli.seven_k_sources);
        let expected: Vec<String> = hatch_sui_scanner::providers::seven_k::DEFAULT_SOURCES
            .iter()
            .map(ToString::to_string)
            .collect();
        assert_eq!(actual, expected);
    }

    #[test]
    fn source_parser_trims_and_drops_empty_values() {
        assert_eq!(split_sources(" cetus, ,turbos "), ["cetus", "turbos"]);
    }
}
