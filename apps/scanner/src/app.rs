use std::{sync::Arc, time::Duration};

use serde::{Deserialize, Serialize};

use crate::{
    QuoteProvider, ScanConfig, Scanner,
    http::HttpClient,
    providers::{
        cetus::{CetusProvider, DEFAULT_ENDPOINT as CETUS_ENDPOINT},
        seven_k::{DEFAULT_ENDPOINT as SEVEN_K_ENDPOINT, SevenKProvider},
    },
};

pub const SUI: &str = "0x2::sui::SUI";
pub const NATIVE_USDC: &str =
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannerSettings {
    pub base_coin: String,
    pub quote_coin: String,
    #[serde(with = "crate::model::u128_string")]
    pub amount_in: u128,
    #[serde(with = "crate::model::u128_string")]
    pub gas_cost: u128,
    #[serde(with = "crate::model::i128_string")]
    pub min_profit_bps: i128,
    pub timeout_ms: u64,
    pub retries: u32,
    pub cetus_endpoint: String,
    pub cetus_sources: Vec<String>,
    pub seven_k_endpoint: String,
    pub seven_k_sources: Vec<String>,
}

impl Default for ScannerSettings {
    fn default() -> Self {
        Self {
            base_coin: SUI.to_owned(),
            quote_coin: NATIVE_USDC.to_owned(),
            amount_in: 1_000_000_000,
            gas_cost: 10_000_000,
            min_profit_bps: 0,
            timeout_ms: 5_000,
            retries: 1,
            cetus_endpoint: CETUS_ENDPOINT.to_owned(),
            cetus_sources: Vec::new(),
            seven_k_endpoint: SEVEN_K_ENDPOINT.to_owned(),
            seven_k_sources: crate::providers::seven_k::DEFAULT_SOURCES
                .iter()
                .map(ToString::to_string)
                .collect(),
        }
    }
}

impl ScannerSettings {
    pub fn validate(&self) -> Result<(), String> {
        if self.amount_in == 0 {
            return Err("amount_in must be greater than zero".to_owned());
        }
        if self.timeout_ms < 100 || self.timeout_ms > 60_000 {
            return Err("timeout_ms must be between 100 and 60000".to_owned());
        }
        if self.retries > 5 {
            return Err("retries must be between 0 and 5".to_owned());
        }
        if self.seven_k_sources.is_empty() {
            return Err("seven_k_sources must include at least one source".to_owned());
        }
        Ok(())
    }

    pub fn scanner(&self) -> Result<Scanner, Box<dyn std::error::Error>> {
        self.validate()
            .map_err(|message| format!("invalid settings: {message}"))?;
        let http = HttpClient::new(Duration::from_millis(self.timeout_ms))?;
        let providers: Vec<Arc<dyn QuoteProvider>> = vec![
            Arc::new(CetusProvider::new(
                http.clone(),
                self.cetus_endpoint.clone(),
                self.cetus_sources.clone(),
            )),
            Arc::new(SevenKProvider::new(
                http,
                self.seven_k_endpoint.clone(),
                self.seven_k_sources.clone(),
            )),
        ];
        Ok(Scanner::new(
            providers,
            ScanConfig {
                base_coin: self.base_coin.clone(),
                quote_coin: self.quote_coin.clone(),
                amount_in: self.amount_in,
                gas_cost: self.gas_cost,
                min_profit_bps: self.min_profit_bps,
                retries: self.retries,
            },
        ))
    }
}

pub fn split_sources(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|source| !source.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}
