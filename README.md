# Setup Minikube Action

A GitHub Action for installing and configuring [Minikube](https://minikube.sigs.k8s.io/) - a local Kubernetes environment that makes it easy to learn and develop for Kubernetes.

## Features

- ✅ Automatic installation of Minikube
- ✅ Support for multiple drivers (docker, podman, virtualbox, etc.)
- ✅ Configurable Kubernetes version
- ✅ Waits for cluster readiness
- ✅ Outputs kubeconfig path for easy integration
- ✅ **Automatic cleanup** - Deletes the cluster after your workflow completes

## Quick Start

```yaml
name: Test with Minikube

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Minikube
        id: minikube
        uses: fenio/setup-minikube@v1
      
      - name: Deploy and test
        run: |
          kubectl apply -f k8s/
          kubectl wait --for=condition=available --timeout=60s deployment/my-app
      
      # Cleanup happens automatically after this job completes!
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `version` | Minikube version to install (e.g., `v1.32.0`) or `latest` | `latest` |
| `kubernetes-version` | Kubernetes version to use (e.g., `v1.28.0`) or `stable` | `stable` |
| `driver` | VM driver to use (docker, podman, virtualbox, kvm2, etc.) | `docker` |
| `wait-for-ready` | Wait for cluster to be ready before completing | `true` |
| `timeout` | Timeout in seconds to wait for cluster readiness | `300` |

## Outputs

| Output | Description |
|--------|-------------|
| `kubeconfig` | Path to the kubeconfig file (typically `~/.kube/config`) |

## Usage Examples

### Basic Usage with Latest Version

```yaml
- name: Setup Minikube
  uses: fenio/setup-minikube@v1
```

### Specific Kubernetes Version

```yaml
- name: Setup Minikube
  uses: fenio/setup-minikube@v1
  with:
    kubernetes-version: 'v1.28.0'
```

### Using Podman Driver

```yaml
- name: Setup Minikube
  uses: fenio/setup-minikube@v1
  with:
    driver: 'podman'
```

### Custom Timeout

```yaml
- name: Setup Minikube
  uses: fenio/setup-minikube@v1
  with:
    timeout: '600'  # 10 minutes
```

## How It Works

### Setup Phase
1. Installs the Minikube binary for your platform
2. Starts a Minikube cluster with the specified driver and Kubernetes version
3. Configures kubectl to use the Minikube cluster
4. Waits for the cluster to become ready (if `wait-for-ready` is enabled)

### Automatic Cleanup (Post-run)
After your workflow steps complete (whether successful or failed), the action automatically:
1. Deletes the Minikube cluster using `minikube delete`
2. Cleans up all cluster resources

This is achieved using GitHub Actions' `post:` hook, similar to how `actions/checkout` cleans up after itself.

## Requirements

- Runs on `ubuntu-latest` or `macos-latest`
- Requires Docker (or another driver) to be pre-installed on the runner
- Requires `sudo` access for binary installation

## Troubleshooting

### Cluster Not Ready

If the cluster doesn't become ready in time, increase the timeout:

```yaml
- name: Setup Minikube
  uses: fenio/setup-minikube@v1
  with:
    timeout: '600'  # 10 minutes
```

### Driver Issues

If you encounter issues with the Docker driver, try using a different driver:

```yaml
- name: Setup Minikube
  uses: fenio/setup-minikube@v1
  with:
    driver: 'podman'
```

## Development

This action is written in TypeScript and compiled to JavaScript using `@vercel/ncc`.

### Building

```bash
npm install
npm run build
```

The compiled output in `dist/` must be committed to the repository for the action to work.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Related Projects

- [Minikube](https://minikube.sigs.k8s.io/) - Local Kubernetes environment
- [setup-k3s](https://github.com/fenio/setup-k3s) - Lightweight Kubernetes (k3s)
- [setup-kubesolo](https://github.com/fenio/setup-kubesolo) - Ultra-lightweight Kubernetes
- [setup-k0s](https://github.com/fenio/setup-k0s) - Zero friction Kubernetes (k0s)
