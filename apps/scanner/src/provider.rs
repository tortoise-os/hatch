use std::fmt;

use async_trait::async_trait;
use serde::Serialize;
use thiserror::Error;

use crate::model::Quote;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureKind {
    Timeout,
    RateLimited,
    Upstream,
    InvalidRequest,
    Decode,
    Arithmetic,
}

impl fmt::Display for FailureKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = match self {
            Self::Timeout => "timeout",
            Self::RateLimited => "rate_limited",
            Self::Upstream => "upstream",
            Self::InvalidRequest => "invalid_request",
            Self::Decode => "decode",
            Self::Arithmetic => "arithmetic",
        };
        formatter.write_str(value)
    }
}

#[derive(Debug, Clone, Error, PartialEq, Eq)]
#[error("{provider} {kind}: {message}")]
pub struct ProviderError {
    pub provider: String,
    pub kind: FailureKind,
    pub message: String,
    pub retryable: bool,
}

impl ProviderError {
    #[must_use]
    pub fn new(
        provider: impl Into<String>,
        kind: FailureKind,
        message: impl Into<String>,
        retryable: bool,
    ) -> Self {
        Self {
            provider: provider.into(),
            kind,
            message: message.into(),
            retryable,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuoteRequest {
    pub coin_in: String,
    pub coin_out: String,
    pub amount_in: u128,
}

#[async_trait]
pub trait QuoteProvider: Send + Sync {
    fn name(&self) -> &str;

    async fn quote(&self, request: &QuoteRequest) -> Result<Quote, ProviderError>;
}
