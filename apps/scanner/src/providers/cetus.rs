use async_trait::async_trait;
use serde::Deserialize;

use crate::{
    http::HttpClient,
    model::{Quote, RouteHop},
    provider::{FailureKind, ProviderError, QuoteProvider, QuoteRequest},
};

use super::{AtomicValue, endpoint_url};

pub const DEFAULT_ENDPOINT: &str = "https://api-sui.cetus.zone/router_v3";
const SDK_VERSION: &str = "1010702";

#[derive(Debug, Clone)]
pub struct CetusProvider {
    http: HttpClient,
    endpoint: String,
    sources: Vec<String>,
}

impl CetusProvider {
    #[must_use]
    pub fn new(http: HttpClient, endpoint: impl Into<String>, sources: Vec<String>) -> Self {
        Self {
            http,
            endpoint: endpoint.into(),
            sources,
        }
    }
}

#[async_trait]
impl QuoteProvider for CetusProvider {
    fn name(&self) -> &'static str {
        "cetus"
    }

    async fn quote(&self, request: &QuoteRequest) -> Result<Quote, ProviderError> {
        let mut url = endpoint_url(self.name(), &self.endpoint, "find_routes")?;
        {
            let mut query = url.query_pairs_mut();
            query
                .append_pair("from", &request.coin_in)
                .append_pair("target", &request.coin_out)
                .append_pair("amount", &request.amount_in.to_string())
                .append_pair("by_amount_in", "true")
                .append_pair("v", SDK_VERSION);
            if !self.sources.is_empty() {
                query.append_pair("providers", &self.sources.join(","));
            }
        }

        let response = self
            .http
            .get_json::<CetusEnvelope>(self.name(), url, None)
            .await?;
        parse_response(response.body, response.observed_at_ms, response.latency_ms)
    }
}

#[derive(Debug, Deserialize)]
struct CetusEnvelope {
    code: u16,
    msg: String,
    data: Option<CetusData>,
}

#[derive(Debug, Deserialize)]
struct CetusData {
    request_id: Option<String>,
    amount_in: AtomicValue,
    amount_out: AtomicValue,
    #[serde(default)]
    paths: Vec<CetusPath>,
}

#[derive(Debug, Deserialize)]
struct CetusPath {
    id: String,
    provider: String,
    from: String,
    target: String,
}

fn parse_response(
    response: CetusEnvelope,
    observed_at_ms: u64,
    latency_ms: u64,
) -> Result<Quote, ProviderError> {
    if response.code != 200 {
        return Err(ProviderError::new(
            "cetus",
            FailureKind::InvalidRequest,
            format!(
                "quote rejected with code {}: {}",
                response.code, response.msg
            ),
            false,
        ));
    }
    let data = response.data.ok_or_else(|| {
        ProviderError::new(
            "cetus",
            FailureKind::Decode,
            "successful response omitted data",
            false,
        )
    })?;
    let amount_in = data.amount_in.parse("cetus", "amount_in")?;
    let amount_out = data.amount_out.parse("cetus", "amount_out")?;
    if amount_out == 0 {
        return Err(ProviderError::new(
            "cetus",
            FailureKind::Decode,
            "quote returned zero output",
            false,
        ));
    }

    let coin_in = data
        .paths
        .first()
        .map(|path| path.from.clone())
        .unwrap_or_default();
    let coin_out = data
        .paths
        .last()
        .map(|path| path.target.clone())
        .unwrap_or_default();
    let route = data
        .paths
        .into_iter()
        .map(|path| RouteHop {
            route_index: 0,
            venue: path.provider.to_ascii_lowercase(),
            pool_id: path.id,
            coin_in: path.from,
            coin_out: path.target,
        })
        .collect();

    Ok(Quote {
        provider: "cetus".to_owned(),
        coin_in,
        coin_out,
        amount_in,
        amount_out,
        quote_id: data.request_id,
        route,
        observed_at_ms,
        latency_ms,
    })
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn providers_cetus_parses_current_response_contract() {
        let envelope: CetusEnvelope =
            serde_json::from_str(include_str!("../../tests/fixtures/cetus-quote.json"))
                .expect("fixture decodes");
        let quote = parse_response(envelope, 123, 9).expect("quote parses");

        assert_eq!(quote.provider, "cetus");
        assert_eq!(quote.amount_in, 1_000_000_000);
        assert_eq!(quote.amount_out, 728_353);
        assert_eq!(quote.quote_id.as_deref(), Some("fixture-cetus"));
        assert_eq!(quote.route.len(), 2);
        assert_eq!(quote.route[0].venue, "cetus");
        assert_eq!(quote.route[1].venue, "bluefin");
        assert_eq!(quote.observed_at_ms, 123);
        assert_eq!(quote.latency_ms, 9);
    }

    #[test]
    fn providers_cetus_rejects_zero_output() {
        let envelope: CetusEnvelope = serde_json::from_str(
            r#"{"code":200,"msg":"Success","data":{"request_id":"x","amount_in":"1","amount_out":"0","paths":[]}}"#,
        )
        .expect("fixture decodes");

        let error = parse_response(envelope, 0, 0).expect_err("zero output rejected");
        assert_eq!(error.kind, FailureKind::Decode);
    }
}
