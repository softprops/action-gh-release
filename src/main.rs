mod github;

use github::{AssetUploader, Release, Releaser};
use reqwest::Client;
use serde::Deserialize;
use std::{error::Error, fs::File};

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

fn run(
    conf: Config,
    releaser: &dyn Releaser,
    uploader: &dyn AssetUploader,
) -> Result<(), Box<dyn Error>> {
    if !conf.github_ref.starts_with("refs/tags/") {
        log::error!("GH Releases require a tag");
        return Ok(());
    }

    let release_id = releaser.release(
        conf.github_token.as_str(),
        conf.github_repository.as_str(),
        release(&conf),
    )?;

    if let Some(patterns) = conf.input_files {
        for pattern in patterns {
            for path in glob::glob(pattern.as_str())? {
                let resolved = path?;
                let mime =
                    mime_guess::from_path(&resolved).first_or(mime::APPLICATION_OCTET_STREAM);
                uploader.upload(
                    conf.github_token.as_str(),
                    conf.github_repository.as_str(),
                    release_id,
                    mime,
                    File::open(resolved)?,
                )?;
            }
        }
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
    fn release_constructs_a_release_from_a_config() -> Result<(), Box<dyn Error>> {
        for (conf, expect) in vec![(Config::default(), Release::default())] {
            assert_eq!(release(&conf), expect);
        }
        Ok(())
    }
}
