# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-09

### Added
- Initial release of setup-minikube action
- Automatic installation of Minikube binary
- Support for multiple drivers (docker, podman, virtualbox, etc.)
- Configurable Kubernetes version
- Wait for cluster readiness with configurable timeout
- Automatic cleanup using GitHub Actions post-run hook
- Export KUBECONFIG environment variable
- Cross-platform support (Linux and macOS)
