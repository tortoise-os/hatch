use std::sync::atomic::{AtomicU64, Ordering};

use async_trait::async_trait;
use serde::Deserialize;

use crate::{
    http::{HttpClient, now_ms},
    model::{Quote, RouteHop},
    provider::{FailureKind, ProviderError, QuoteProvider, QuoteRequest},
};

use super::{AtomicValue, endpoint_url};

pub const DEFAULT_ENDPOINT: &str = "https://aggregator.api.sui-prod.bluefin.io";
pub const DEFAULT_SOURCES: &[&str] = &[
    "turbos",
    "cetus",
    "aftermath",
    "deepbook_v3",
    "flowx_v3",
    "bluefin",
];

static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone)]
pub struct SevenKProvider {
    name: String,
    http: HttpClient,
    endpoint: String,
    sources: Vec<String>,
}

impl SevenKProvider {
    #[must_use]
    pub fn new(http: HttpClient, endpoint: impl Into<String>, sources: Vec<String>) -> Self {
        Self {
            name: "seven_k".to_owned(),
            http,
            endpoint: endpoint.into(),
            sources,
        }
    }

    #[must_use]
    pub fn new_named(
        name: impl Into<String>,
        http: HttpClient,
        endpoint: impl Into<String>,
        sources: Vec<String>,
    ) -> Self {
        Self {
            name: name.into(),
            http,
            endpoint: endpoint.into(),
            sources,
        }
    }
}

#[async_trait]
impl QuoteProvider for SevenKProvider {
    fn name(&self) -> &str {
        &self.name
    }

    async fn quote(&self, request: &QuoteRequest) -> Result<Quote, ProviderError> {
        let mut url = endpoint_url(self.name(), &self.endpoint, "v3/quote")?;
        {
            let mut query = url.query_pairs_mut();
            query
                .append_pair("from", &request.coin_in)
                .append_pair("to", &request.coin_out)
                .append_pair("amount", &request.amount_in.to_string())
                .append_pair("sources", &self.sources.join(","));
        }

        let request_id = format!(
            "tortoise-{}-{}",
            now_ms(),
            REQUEST_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        let response = self
            .http
            .get_json::<SevenKResponse>(self.name(), url, Some(&request_id))
            .await?;
        let mut quote = parse_response(
            response.body,
            request_id,
            response.observed_at_ms,
            response.latency_ms,
        )?;
        quote.provider.clone_from(&self.name);
        Ok(quote)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SevenKResponse {
    swap_amount_with_decimal: AtomicValue,
    return_amount_with_decimal: AtomicValue,
    token_in: String,
    token_out: String,
    #[serde(default)]
    routes: Vec<SevenKRoute>,
    #[serde(default)]
    swaps: Vec<SevenKSwap>,
}

#[derive(Debug, Deserialize)]
struct SevenKRoute {
    #[serde(default)]
    hops: Vec<SevenKHop>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SevenKHop {
    pool_id: String,
    token_in: String,
    token_out: String,
    pool: SevenKPool,
}

#[derive(Debug, Deserialize)]
struct SevenKPool {
    #[serde(rename = "type")]
    venue: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SevenKSwap {
    pool_id: String,
    asset_in: String,
    asset_out: String,
}

fn parse_response(
    response: SevenKResponse,
    request_id: String,
    observed_at_ms: u64,
    latency_ms: u64,
) -> Result<Quote, ProviderError> {
    let amount_in = response
        .swap_amount_with_decimal
        .parse("seven_k", "swapAmountWithDecimal")?;
    let amount_out = response
        .return_amount_with_decimal
        .parse("seven_k", "returnAmountWithDecimal")?;
    if amount_out == 0 {
        return Err(ProviderError::new(
            "seven_k",
            FailureKind::Decode,
            "quote returned zero output",
            false,
        ));
    }

    let mut route: Vec<RouteHop> = response
        .routes
        .into_iter()
        .enumerate()
        .flat_map(|(route_index, route)| {
            route.hops.into_iter().map(move |hop| RouteHop {
                route_index,
                venue: hop.pool.venue,
                pool_id: hop.pool_id,
                coin_in: hop.token_in,
                coin_out: hop.token_out,
            })
        })
        .collect();
    if route.is_empty() {
        route = response
            .swaps
            .into_iter()
            .map(|swap| RouteHop {
                route_index: 0,
                venue: "unknown".to_owned(),
                pool_id: swap.pool_id,
                coin_in: swap.asset_in,
                coin_out: swap.asset_out,
            })
            .collect();
    }

    Ok(Quote {
        provider: "seven_k".to_owned(),
        coin_in: response.token_in,
        coin_out: response.token_out,
        amount_in,
        amount_out,
        quote_id: Some(request_id),
        route,
        estimated_gas_cost: None,
        observed_at_ms,
        latency_ms,
    })
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn providers_seven_k_parses_current_response_contract() {
        let response: SevenKResponse =
            serde_json::from_str(include_str!("../../tests/fixtures/seven-k-quote.json"))
                .expect("fixture decodes");
        let quote =
            parse_response(response, "fixture-7k".to_owned(), 456, 12).expect("quote parses");

        assert_eq!(quote.provider, "seven_k");
        assert_eq!(quote.amount_in, 1_000_000_000);
        assert_eq!(quote.amount_out, 728_742);
        assert_eq!(quote.quote_id.as_deref(), Some("fixture-7k"));
        assert_eq!(quote.route.len(), 2);
        assert_eq!(quote.route[0].venue, "cetus");
        assert_eq!(quote.route[1].venue, "bluefin");
        assert_eq!(quote.observed_at_ms, 456);
        assert_eq!(quote.latency_ms, 12);
    }

    #[test]
    fn providers_seven_k_falls_back_to_swap_metadata() {
        let response: SevenKResponse = serde_json::from_str(
            r#"{"swapAmountWithDecimal":"1","returnAmountWithDecimal":"2","tokenIn":"A","tokenOut":"B","swaps":[{"poolId":"pool","assetIn":"A","assetOut":"B"}]}"#,
        )
        .expect("fixture decodes");

        let quote = parse_response(response, "id".to_owned(), 0, 0).expect("quote parses");
        assert_eq!(quote.route[0].venue, "unknown");
        assert_eq!(quote.route[0].pool_id, "pool");
    }

    #[test]
    fn isolated_provider_keeps_venue_identity() {
        let http = HttpClient::new(std::time::Duration::from_secs(1)).unwrap();
        let provider = SevenKProvider::new_named(
            "seven_k:deepbook_v3",
            http,
            DEFAULT_ENDPOINT,
            vec!["deepbook_v3".to_owned()],
        );
        assert_eq!(provider.name(), "seven_k:deepbook_v3");
    }
}
