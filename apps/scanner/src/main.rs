use std::sync::Arc;
use std::{net::SocketAddr, process::ExitCode};

use clap::Parser;
use hatch_sui_scanner::{
    api::{ApiState, router},
    app::{NATIVE_USDC, SUI, ScannerSettings, split_sources},
    journal::default_journal_path,
    simulation::{AtomicSimulationConfig, CommandAtomicSimulator},
};

#[derive(Debug, Parser)]
#[command(
    name = "hatch-sui-scanner",
    version,
    about = "Read-only Sui quote-surface arbitrage scanner"
)]
struct Cli {
    /// Run read-only HTTP API instead of one-shot JSON output.
    #[arg(long)]
    serve: bool,

    /// HTTP listen address in server mode.
    #[arg(long, default_value = "127.0.0.1:3411")]
    listen: SocketAddr,

    #[arg(long, default_value = SUI)]
    base_coin: String,

    #[arg(long, default_value = NATIVE_USDC)]
    quote_coin: String,

    #[arg(long, default_value_t = 1_000_000_000_u128)]
    amount: u128,

    #[arg(long, default_value_t = 2_000_000_u128)]
    gas_cost: u128,

    #[arg(long, default_value_t = 1_i128)]
    min_profit_bps: i128,

    #[arg(long, default_value_t = 2_000_u64)]
    max_quote_skew_ms: u64,

    #[arg(long, default_value_t = 5_000_u64)]
    timeout_ms: u64,

    #[arg(long, default_value_t = 1_u32)]
    retries: u32,

    #[arg(long, default_value = hatch_sui_scanner::providers::cetus::DEFAULT_ENDPOINT)]
    cetus_endpoint: String,

    #[arg(long, default_value = "")]
    cetus_sources: String,

    #[arg(long, default_value = hatch_sui_scanner::providers::seven_k::DEFAULT_ENDPOINT)]
    seven_k_endpoint: String,

    #[arg(
        long,
        default_value = "turbos,cetus,aftermath,deepbook_v3,flowx_v3,bluefin"
    )]
    seven_k_sources: String,
}

impl From<&Cli> for ScannerSettings {
    fn from(cli: &Cli) -> Self {
        Self {
            base_coin: cli.base_coin.clone(),
            quote_coin: cli.quote_coin.clone(),
            amount_in: cli.amount,
            gas_cost: cli.gas_cost,
            min_profit_bps: cli.min_profit_bps,
            max_quote_skew_ms: cli.max_quote_skew_ms,
            timeout_ms: cli.timeout_ms,
            retries: cli.retries,
            cetus_endpoint: cli.cetus_endpoint.clone(),
            cetus_sources: split_sources(&cli.cetus_sources),
            seven_k_endpoint: cli.seven_k_endpoint.clone(),
            seven_k_sources: split_sources(&cli.seven_k_sources),
        }
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    let settings = ScannerSettings::from(&cli);
    let result = if cli.serve {
        serve(cli.listen, settings).await.map(|()| true)
    } else {
        run_once(settings).await
    };

    match result {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::from(2),
        Err(error) => {
            eprintln!("scanner error: {error}");
            ExitCode::from(1)
        }
    }
}

async fn run_once(settings: ScannerSettings) -> Result<bool, Box<dyn std::error::Error>> {
    let report = settings.scanner()?.scan().await?;
    let has_round_trip = report.has_complete_round_trip();
    println!("{}", serde_json::to_string(&report)?);
    Ok(has_round_trip)
}

async fn serve(
    listen: SocketAddr,
    settings: ScannerSettings,
) -> Result<(), Box<dyn std::error::Error>> {
    settings
        .validate()
        .map_err(|message| format!("invalid settings: {message}"))?;
    let listener = tokio::net::TcpListener::bind(listen).await?;
    let mut state = ApiState::persistent(settings, default_journal_path())?;
    if let Some(config) = AtomicSimulationConfig::from_env()? {
        state = state.with_simulator(Arc::new(CommandAtomicSimulator::new(config)));
    }
    println!("Hatch scanner API listening on http://{listen} (read only)");
    axum::serve(listener, router(state)).await?;
    Ok(())
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
