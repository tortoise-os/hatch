pub mod api;
pub mod app;
pub mod http;
pub mod model;
pub mod provider;
pub mod providers;
pub mod research;
pub mod scanner;

pub use model::{Opportunity, ProviderFailure, Quote, RouteHop, ScanReport};
pub use provider::{FailureKind, ProviderError, QuoteProvider, QuoteRequest};
pub use research::{ConfirmedOpportunity, ResearchReport};
pub use scanner::{ScanConfig, ScanError, Scanner};
