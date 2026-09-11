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
    use super::*;

    #[test]
    fn journal_reloads_valid_reports_and_counts_bad_lines() {
        let path = std::env::temp_dir().join(format!(
            "hatch-journal-{}-{}.jsonl",
            std::process::id(),
            crate::http::now_ms()
        ));
        let (journal, _) = ResearchJournal::open(path.clone()).unwrap();
        let report = ResearchReport {
            schema_version: 2,
            observed_at_ms: 1,
            amounts_tested: vec![1],
            markets_tested: vec!["B".to_owned()],
            routes_evaluated: 0,
            provider_failures: 0,
            confirmation_runs: 3,
            discovery_reports: 1,
            venue_isolated_reports: 0,
            venues_tested: Vec::new(),
            opportunities: Vec::new(),
            reports: Vec::new(),
        };
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
        fs::remove_file(path).unwrap();
    }
}
