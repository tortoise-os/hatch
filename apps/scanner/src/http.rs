use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use reqwest::{Client, StatusCode, Url};
use serde::de::DeserializeOwned;

use crate::provider::{FailureKind, ProviderError};

#[derive(Debug, Clone)]
pub struct HttpClient {
    client: Client,
}

#[derive(Debug)]
pub struct HttpJson<T> {
    pub body: T,
    pub observed_at_ms: u64,
    pub latency_ms: u64,
}

impl HttpClient {
    pub fn new(timeout: Duration) -> Result<Self, reqwest::Error> {
        let client = Client::builder()
            .timeout(timeout)
            .user_agent(concat!("hatch-sui-scanner/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { client })
    }

    pub async fn get_json<T>(
        &self,
        provider: &'static str,
        url: Url,
        request_id: Option<&str>,
    ) -> Result<HttpJson<T>, ProviderError>
    where
        T: DeserializeOwned,
    {
        let started = Instant::now();
        let mut request = self.client.get(url);
        if let Some(request_id) = request_id {
            request = request.header("x-request-id", request_id);
        }

        let response = request.send().await.map_err(|error| {
            if error.is_timeout() {
                ProviderError::new(provider, FailureKind::Timeout, error.to_string(), true)
            } else {
                ProviderError::new(provider, FailureKind::Upstream, error.to_string(), true)
            }
        })?;

        let status = response.status();
        let latency_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
        let observed_at_ms = now_ms();
        let response_text = response.text().await.map_err(|error| {
            ProviderError::new(provider, FailureKind::Upstream, error.to_string(), true)
        })?;

        if !status.is_success() {
            return Err(status_error(provider, status, &response_text));
        }

        let body = serde_json::from_str(&response_text).map_err(|error| {
            ProviderError::new(
                provider,
                FailureKind::Decode,
                format!("invalid JSON response: {error}"),
                false,
            )
        })?;

        Ok(HttpJson {
            body,
            observed_at_ms,
            latency_ms,
        })
    }
}

#[must_use]
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| u64::try_from(duration.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or_default()
}

fn status_error(provider: &'static str, status: StatusCode, body: &str) -> ProviderError {
    let message = format!("HTTP {}: {}", status.as_u16(), truncate(body.trim(), 300));
    match status {
        StatusCode::TOO_MANY_REQUESTS => {
            ProviderError::new(provider, FailureKind::RateLimited, message, true)
        }
        status if status.is_server_error() => {
            ProviderError::new(provider, FailureKind::Upstream, message, true)
        }
        _ => ProviderError::new(provider, FailureKind::InvalidRequest, message, false),
    }
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_classification_marks_transient_statuses() {
        let rate_limit = status_error("test", StatusCode::TOO_MANY_REQUESTS, "slow down");
        let server = status_error("test", StatusCode::BAD_GATEWAY, "down");
        let bad_request = status_error("test", StatusCode::BAD_REQUEST, "bad input");

        assert_eq!(rate_limit.kind, FailureKind::RateLimited);
        assert!(rate_limit.retryable);
        assert_eq!(server.kind, FailureKind::Upstream);
        assert!(server.retryable);
        assert_eq!(bad_request.kind, FailureKind::InvalidRequest);
        assert!(!bad_request.retryable);
    }
}
