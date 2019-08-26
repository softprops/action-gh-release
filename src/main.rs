mod github;

use github::{AssetUploader, Release, ReleaseResponse, Releaser};
use mime::Mime;
use reqwest::Client;
use serde::Deserialize;
use std::{
    error::Error,
    fs::File,
    path::{Path, PathBuf},
};

type BoxError = Box<dyn Error>;

#[derive(Deserialize, Default, Debug, PartialEq)]
struct Config {
    // github provided
    github_token: String,
    github_ref: String,
    github_repository: String,
    // user provided
    input_name: Option<String>,
    input_body: Option<String>,
    input_files: Option<Vec<String>>,
    input_draft: Option<bool>,
}

fn release(conf: &Config) -> Release {
    let Config {
        github_ref,
        input_name,
        input_body,
        input_draft,
        ..
    } = conf;
    let tag_name = github_ref.trim_start_matches("refs/tags/").to_string();
    let name = input_name.clone().or_else(|| Some(tag_name.clone()));
    let draft = *input_draft;
    Release {
        tag_name,
        name,
        body: input_body.clone(),
        draft,
    }
}

fn is_tag<R>(gitref: R) -> bool
where
    R: AsRef<str>,
{
    gitref.as_ref().starts_with("refs/tags/")
}

fn mime_or_default<P>(path: P) -> Mime
where
    P: AsRef<Path>,
{
    mime_guess::from_path(path).first_or(mime::APPLICATION_OCTET_STREAM)
}

fn paths<P>(
    patterns: impl IntoIterator<Item = P>
) -> Result<impl IntoIterator<Item = PathBuf>, BoxError>
where
    P: AsRef<str>,
{
    patterns
        .into_iter()
        .try_fold(Vec::new(), |mut paths, pattern| {
            let matched = glob::glob(pattern.as_ref())?
                .filter_map(Result::ok)
                .filter(|p| p.is_file());
            paths.extend(matched);
            Ok(paths)
        })
}

fn run(
    conf: Config,
    releaser: &dyn Releaser,
    uploader: &dyn AssetUploader,
) -> Result<(), BoxError> {
    if !is_tag(&conf.github_ref) {
        eprintln!("⚠️ GH Releases require a tag");
        return Ok(());
    }

    let ReleaseResponse { id, html_url } = releaser.release(
        conf.github_token.as_str(),
        conf.github_repository.as_str(),
        release(&conf),
    )?;

    if let Some(patterns) = conf.input_files {
        for path in paths(patterns)? {
            println!("⬆️ Uploading asset {}", path.display());
            let status = uploader.upload(
                conf.github_token.as_str(),
                conf.github_repository.as_str(),
                id,
                mime_or_default(&path),
                File::open(path)?,
            )?;
            println!("uploaded with status {}", status);
        }
    }

    println!("🎉 Release ready at {}", html_url);

    Ok(())
}

fn main() -> Result<(), BoxError> {
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
    fn release_constructs_a_release_from_a_config() -> Result<(), BoxError> {
        for (conf, expect) in vec![
            (
                Config {
                    github_ref: "refs/tags/v1.0.0".into(),
                    ..Config::default()
                },
                Release {
                    tag_name: "v1.0.0".into(),
                    name: Some("v1.0.0".into()),
                    ..Release::default()
                },
            ),
            (
                Config {
                    github_ref: "refs/tags/v1.0.0".into(),
                    input_name: Some("custom".into()),
                    ..Config::default()
                },
                Release {
                    tag_name: "v1.0.0".into(),
                    name: Some("custom".into()),
                    ..Release::default()
                },
            ),
        ] {
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

    #[test]
    fn paths_resolves_pattern_to_file_paths() -> Result<(), BoxError> {
        assert_eq!(paths(vec!["tests/data/**/*"])?.into_iter().count(), 1);
        Ok(())
    }

    #[test]
    fn config_is_parsed_from_env() -> Result<(), BoxError> {
        for (env, expect) in vec![(
            vec![
                ("GITHUB_TOKEN".into(), "123".into()),
                ("GITHUB_REF".into(), "refs/tags/ref".into()),
                ("GITHUB_REPOSITORY".into(), "foo/bar".into()),
                ("INPUT_NAME".into(), "test release".into()),
                ("INPUT_BODY".into(), ":)".into()),
                ("INPUT_FILES".into(), "*.md".into()),
            ],
            Config {
                github_token: "123".into(),
                github_ref: "refs/tags/ref".into(),
                github_repository: "foo/bar".into(),
                input_name: Some("test release".into()),
                input_body: Some(":)".into()),
                input_files: Some(vec!["*.md".into()]),
            },
        )] {
            assert_eq!(expect, envy::from_iter::<_, Config>(env)?)
        }
        Ok(())
    }
}
