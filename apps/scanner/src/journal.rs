use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    sync::Arc,
};

use thiserror::Error;

use crate::ResearchReport;

#[derive(Debug, Error)]
pub enum JournalError {
    #[error("journal I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("journal serialization failed: {0}")]
    Serialize(#[from] serde_json::Error),
}

#[derive(Debug, Default)]
pub struct JournalLoad {
    pub reports: Vec<ResearchReport>,
    pub rejected_lines: usize,
}

#[derive(Debug, Clone)]
pub struct ResearchJournal {
    path: Arc<PathBuf>,
}

impl ResearchJournal {
    pub fn open(path: PathBuf) -> Result<(Self, JournalLoad), JournalError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        OpenOptions::new().create(true).append(true).open(&path)?;
        let journal = Self {
            path: Arc::new(path),
        };
        let load = journal.load()?;
        Ok((journal, load))
    }

    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn append(&self, report: &ResearchReport) -> Result<(), JournalError> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.path.as_ref())?;
        serde_json::to_writer(&mut file, report)?;
        file.write_all(b"\n")?;
        file.flush()?;
        Ok(())
    }

    fn load(&self) -> Result<JournalLoad, JournalError> {
        let file = File::open(self.path.as_ref())?;
        let mut load = JournalLoad::default();
        for line in BufReader::new(file).lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            match serde_json::from_str(&line) {
                Ok(report) => load.reports.push(report),
                Err(_) => load.rejected_lines += 1,
            }
        }
        Ok(load)
    }
}

#[must_use]
pub fn default_journal_path() -> PathBuf {
    std::env::var_os("HATCH_SCANNER_JOURNAL").map_or_else(
        || {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("data")
                .join("research.jsonl")
        },
        PathBuf::from,
    )
}

#[cfg(test)]
mod tests {
    use crate::{Opportunity, Quote, RouteHop, ScanReport, cartography::build_cartography};

    use super::*;

    fn report() -> ResearchReport {
        let quote = |provider: &str, pool: &str, amount_in, amount_out| Quote {
            provider: provider.to_owned(),
            coin_in: "A".to_owned(),
            coin_out: "B".to_owned(),
            amount_in,
            amount_out,
            quote_id: Some("quote".to_owned()),
            route: vec![RouteHop {
                route_index: 0,
                venue: provider.to_owned(),
                pool_id: pool.to_owned(),
                coin_in: "A".to_owned(),
                coin_out: "B".to_owned(),
            }],
            estimated_gas_cost: Some(7),
            observed_at_ms: 1,
            latency_ms: 2,
        };
        let candidate = Opportunity {
            forward: quote("seven_k:cetus", "forward", 100, 120),
            reverse: quote("seven_k:turbos", "reverse", 120, 111),
            same_quote_provider: false,
            shared_pool_ids: Vec::new(),
            returned_base: 111,
            gross_profit: 11,
            gas_cost: 1,
            net_profit: 10,
            net_profit_bps: 1_000,
            quote_skew_ms: 0,
            rejection_reasons: Vec::new(),
            meets_threshold: true,
        };
        ResearchReport {
            schema_version: 3,
            observed_at_ms: 1,
            amounts_tested: vec![100],
            markets_tested: vec!["B".to_owned()],
            market_metadata: Vec::new(),
            routes_evaluated: 1,
            provider_failures: 0,
            confirmation_runs: 3,
            discovery_reports: 0,
            venue_isolated_reports: 1,
            venues_tested: vec!["cetus".to_owned(), "turbos".to_owned()],
            opportunities: Vec::new(),
            reports: vec![ScanReport {
                schema_version: 1,
                observed_at_ms: 1,
                base_coin: "A".to_owned(),
                quote_coin: "B".to_owned(),
                amount_in: 100,
                gas_cost: 1,
                min_profit_bps: 1,
                candidates: vec![candidate],
                failures: Vec::new(),
            }],
        }
    }

    #[test]
    fn journal_reloads_valid_reports_and_counts_bad_lines() {
        let path = std::env::temp_dir().join(format!(
            "hatch-journal-{}-{}.jsonl",
            std::process::id(),
            crate::http::now_ms()
        ));
        let (journal, _) = ResearchJournal::open(path.clone()).unwrap();
        let report = report();
        journal.append(&report).unwrap();
        OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(b"not-json\n")
            .unwrap();

        let (_, load) = ResearchJournal::open(path.clone()).unwrap();
        assert_eq!(load.reports, [report]);
        assert_eq!(load.rejected_lines, 1);
        assert_eq!(load.reports[0].reports[0].candidates[0].net_profit, 10);
        assert_eq!(
            load.reports[0].reports[0].candidates[0].forward.route[0].pool_id,
            "forward"
        );
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn journal_reload_preserves_cartography() {
        let path = std::env::temp_dir().join(format!(
            "hatch-cartography-journal-{}-{}.jsonl",
            std::process::id(),
            crate::http::now_ms()
        ));
        let (journal, _) = ResearchJournal::open(path.clone()).unwrap();
        let expected = report();
        let before = build_cartography(std::slice::from_ref(&expected), 9, 0);
        journal.append(&expected).unwrap();

        let (_, load) = ResearchJournal::open(path.clone()).unwrap();
        let after = build_cartography(&load.reports, 9, load.rejected_lines);
        assert_eq!(before, after);
        fs::remove_file(path).unwrap();
    }
}
