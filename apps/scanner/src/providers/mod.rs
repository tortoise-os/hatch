pub mod cetus;
pub mod seven_k;

use serde::Deserialize;

use crate::provider::{FailureKind, ProviderError};

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum AtomicValue {
    String(String),
    Unsigned(u64),
}

impl AtomicValue {
    fn parse(&self, provider: &str, field: &str) -> Result<u128, ProviderError> {
        match self {
            Self::String(value) => value.parse().map_err(|error| {
                ProviderError::new(
                    provider,
                    FailureKind::Decode,
                    format!("invalid {field} atomic amount `{value}`: {error}"),
                    false,
                )
            }),
            Self::Unsigned(value) => Ok(u128::from(*value)),
        }
    }
}

fn endpoint_url(provider: &str, endpoint: &str, path: &str) -> Result<reqwest::Url, ProviderError> {
    let full = format!("{}/{path}", endpoint.trim_end_matches('/'));
    reqwest::Url::parse(&full).map_err(|error| {
        ProviderError::new(
            provider,
            FailureKind::InvalidRequest,
            format!("invalid endpoint `{endpoint}`: {error}"),
            false,
        )
    })
}
