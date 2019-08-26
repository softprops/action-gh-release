use mime::Mime;
use reqwest::{Body, Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::{error::Error, fs::File};

#[derive(Serialize, Default, Debug, PartialEq)]
pub struct Release {
    pub tag_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft: Option<bool>,
}

#[derive(Deserialize)]
pub struct ReleaseResponse {
    pub id: usize,
    pub html_url: String,
}

pub trait Releaser {
    fn release(
        &self,
        github_token: &str,
        github_repo: &str,
        release: Release,
    ) -> Result<ReleaseResponse, Box<dyn Error>>;
}

pub trait AssetUploader<A: Into<Body> = File> {
    fn upload(
        &self,
        github_token: &str,
        github_repo: &str,
        release_id: usize,
        name: &str,
        mime: Mime,
        asset: A,
    ) -> Result<StatusCode, Box<dyn Error>>;
}

impl Releaser for Client {
    // https://developer.github.com/v3/repos/releases/#create-a-release
    // https://developer.github.com/v3/repos/releases/#edit-a-release
    fn release(
        &self,
        github_token: &str,
        github_repo: &str,
        release: Release,
    ) -> Result<ReleaseResponse, Box<dyn Error>> {
        let endpoint = format!("https://api.github.com/repos/{}/releases", github_repo);
        let mut existing = self
            .get(&format!("{}/tags/{}", endpoint, release.tag_name))
            .header("Authorization", format!("bearer {}", github_token))
            .send()?;
        match existing.status() {
            StatusCode::NOT_FOUND => Ok(self
                .post(&format!(
                    "https://api.github.com/repos/{}/releases",
                    github_repo
                ))
                .header("Authorization", format!("bearer {}", github_token))
                .json(&release)
                .send()?
                .json()?),
            _ => Ok(self
                .patch(&format!(
                    "https://api.github.com/repos/{}/releases/{}",
                    github_repo,
                    existing.json::<ReleaseResponse>()?.id
                ))
                .header("Authorization", format!("bearer {}", github_token))
                .json(&release)
                .send()?
                .json()?),
        }
    }
}

impl<A: Into<Body>> AssetUploader<A> for Client {
    // https://developer.github.com/v3/repos/releases/#upload-a-release-asset
    fn upload(
        &self,
        github_token: &str,
        github_repo: &str,
        release_id: usize,
        name: &str,
        mime: mime::Mime,
        asset: A,
    ) -> Result<StatusCode, Box<dyn Error>> {
        Ok(self
            .post(&format!(
                "http://uploads.github.com/repos/{}/releases/{}/assets",
                github_repo, release_id
            ))
            .header("Authorization", format!("bearer {}", github_token))
            .header("Content-Type", mime.to_string())
            .query(&[("name", name)])
            .body(asset)
            .send()?
            .status())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {}
}
