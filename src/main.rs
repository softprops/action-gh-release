mod github;

use github::{AssetUploader, Release, ReleaseResponse, Releaser};
use reqwest::Client;
use serde::Deserialize;
use std::{
    error::Error,
    fs::File,
    path::{Path, PathBuf},
};

#[derive(Deserialize, Default)]
struct Config {
    // provided
    github_token: String,
    github_ref: String, // refs/heads/..., ref/tags/...
    github_repository: String,
    // optional
    input_body: Option<String>,
    input_files: Option<Vec<String>>,
}

fn release(conf: &Config) -> Release {
    let Config {
        github_ref,
        input_body,
        ..
    } = conf;
    Release {
        tag_name: github_ref.clone(),
        body: input_body.clone(),
        ..Release::default()
    }
}

fn is_tag<R>(gitref: R) -> bool
where
    R: AsRef<str>,
{
    gitref.as_ref().starts_with("refs/tags/")
}

fn mime_or_default<P>(path: P) -> mime::Mime
where
    P: AsRef<Path>,
{
    mime_guess::from_path(path).first_or(mime::APPLICATION_OCTET_STREAM)
}

fn run(
    conf: Config,
    releaser: &dyn Releaser,
    uploader: &dyn AssetUploader,
) -> Result<(), Box<dyn Error>> {
    if !is_tag(&conf.github_ref) {
        eprintln!("GH Releases require a tag");
        return Ok(());
    }

    let ReleaseResponse { id, html_url } = releaser.release(
        conf.github_token.as_str(),
        conf.github_repository.as_str(),
        release(&conf),
    )?;

    if let Some(patterns) = conf.input_files {
        let paths: Result<Vec<PathBuf>, Box<dyn Error>> =
            patterns
                .into_iter()
                .try_fold(Vec::new(), |mut paths, pattern| {
                    let matched = glob::glob(pattern.as_str())?.filter_map(Result::ok);
                    paths.extend(matched);
                    Ok(paths)
                });
        for path in paths? {
            log::info!("⬆️ Uploading asset {}", path.display());
            uploader.upload(
                conf.github_token.as_str(),
                conf.github_repository.as_str(),
                id,
                mime_or_default(&path),
                File::open(path)?,
            )?;
        }

        println!("🎉 Release ready at {}", html_url);
    }

    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    env_logger::init();
    let client = Client::new();
    run(envy::from_env()?, &client, &client)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mime_or_default_defaults_to_octect_stream() {
        assert_eq!(
            mime_or_default("umbiguous-file"),
            mime::APPLICATION_OCTET_STREAM
        )
    }

    #[test]
    fn release_constructs_a_release_from_a_config() -> Result<(), Box<dyn Error>> {
        for (conf, expect) in vec![(Config::default(), Release::default())] {
            assert_eq!(release(&conf), expect);
        }
        Ok(())
    }

    #[test]
    fn is_tag_checks_refs() {
        for (gitref, expect) in &[("refs/tags/foo", true), ("refs/heads/master", false)] {
            assert_eq!(is_tag(gitref), *expect)
        }
    }
}
