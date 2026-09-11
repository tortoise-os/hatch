use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RouteHop {
    pub route_index: usize,
    pub venue: String,
    pub pool_id: String,
    pub coin_in: String,
    pub coin_out: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Quote {
    pub provider: String,
    pub coin_in: String,
    pub coin_out: String,
    #[serde(with = "u128_string")]
    pub amount_in: u128,
    #[serde(with = "u128_string")]
    pub amount_out: u128,
    pub quote_id: Option<String>,
    pub route: Vec<RouteHop>,
    #[serde(default, with = "option_u128_string")]
    pub estimated_gas_cost: Option<u128>,
    pub observed_at_ms: u64,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderFailure {
    pub provider: String,
    pub stage: String,
    pub kind: String,
    pub retryable: bool,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Opportunity {
    pub forward: Quote,
    pub reverse: Quote,
    pub same_quote_provider: bool,
    pub shared_pool_ids: Vec<String>,
    #[serde(with = "u128_string")]
    pub returned_base: u128,
    #[serde(with = "i128_string")]
    pub gross_profit: i128,
    #[serde(with = "u128_string")]
    pub gas_cost: u128,
    #[serde(with = "i128_string")]
    pub net_profit: i128,
    #[serde(with = "i128_string")]
    pub net_profit_bps: i128,
    pub quote_skew_ms: u64,
    pub rejection_reasons: Vec<String>,
    pub meets_threshold: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScanReport {
    pub schema_version: u8,
    pub observed_at_ms: u64,
    pub base_coin: String,
    pub quote_coin: String,
    #[serde(with = "u128_string")]
    pub amount_in: u128,
    #[serde(with = "u128_string")]
    pub gas_cost: u128,
    #[serde(with = "i128_string")]
    pub min_profit_bps: i128,
    pub candidates: Vec<Opportunity>,
    pub failures: Vec<ProviderFailure>,
}

impl ScanReport {
    #[must_use]
    pub fn has_complete_round_trip(&self) -> bool {
        !self.candidates.is_empty()
    }

    pub fn opportunities(&self) -> impl Iterator<Item = &Opportunity> {
        self.candidates
            .iter()
            .filter(|candidate| candidate.meets_threshold)
    }
}

pub mod u128_string {
    use super::*;

    pub fn serialize<S>(value: &u128, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&value.to_string())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<u128, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        value.parse().map_err(serde::de::Error::custom)
    }
}

pub mod u128_vec_string {
    use super::*;

    pub fn serialize<S>(values: &[u128], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        values
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .serialize(serializer)
    }
}

pub mod i128_string {
    use super::*;

    pub fn serialize<S>(value: &i128, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&value.to_string())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<i128, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        value.parse().map_err(serde::de::Error::custom)
    }
}

pub mod option_u128_string {
    use super::*;

    pub fn serialize<S>(value: &Option<u128>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        value.map(|inner| inner.to_string()).serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<u128>, D::Error>
    where
        D: Deserializer<'de>,
    {
        Option::<String>::deserialize(deserializer)?
            .map(|value| value.parse().map_err(serde::de::Error::custom))
            .transpose()
    }
}
