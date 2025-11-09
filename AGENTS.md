# AGENTS.md

This file provides comprehensive documentation about the setup-minikube GitHub Action for AI agents and developers working with this codebase.

## ⚠️ CRITICAL PRINCIPLE: SYSTEM STATE RESTORATION ⚠️

**THE MOST IMPORTANT REQUIREMENT OF THIS ACTION:**

This action MUST leave the system in EXACTLY the same state as it was before the action ran. This is a non-negotiable requirement.

### Why This Matters
GitHub Actions assume that each workflow runs on a pristine Ubuntu fresh install. Any changes made during setup (installing binaries, creating files, starting services) MUST be completely reversed during cleanup. Failure to restore the system state can break subsequent workflows or leave orphaned processes and files.

### What Must Be Restored
Every operation in the setup phase has a corresponding cleanup operation:

| Setup Operation | Cleanup Operation | Location |
|----------------|-------------------|----------|
| Install minikube binary (`/usr/local/bin/minikube`) | Binary explicitly removed with `rm -f` | `src/cleanup.ts:~51` |
| Start minikube cluster | Cluster deleted by `minikube delete` | `src/cleanup.ts:44` |
| Create kubeconfig in `~/.kube/config` | Left in place (user home directory) | N/A |
| Create minikube profile directory (`~/.minikube`) | Removed by `minikube delete` | `src/cleanup.ts:44` |
| Set KUBECONFIG environment variable | No cleanup needed - job-scoped only | N/A |

### Cleanup Guarantees
- Cleanup runs automatically via GitHub Actions `post:` hook - it ALWAYS runs, even if the workflow fails
- Cleanup is non-failing (`ignoreReturnCode: true`) to ensure it completes even if some operations encounter errors
- The `minikube delete` command removes the cluster and all associated resources

### When Making Changes
**BEFORE adding any new setup operation, you MUST add the corresponding cleanup operation.**

If you:
- Create a file → Delete it in cleanup
- Modify a config → Restore original in cleanup
- Stop a service → Restart it in cleanup
- Install a package → Uninstall it in cleanup

**Violating this principle will break other workflows and is unacceptable.**

---

## Project Overview

**setup-minikube** is a GitHub Action that installs and configures minikube - Local Kubernetes for CI/CD. The action is specifically designed for self-hosted GitHub runners and handles both setup and automatic cleanup/restoration of the system state.

### Key Features
- Automatic installation of minikube with version selection
- Support for multiple drivers (docker, none, podman)
- Kubernetes version selection
- Cluster readiness checks with configurable timeout
- **Automatic post-run cleanup and complete system restoration** (MOST IMPORTANT FEATURE)
- Outputs kubeconfig path for easy integration with kubectl

## Architecture

### Entry Point Flow
The action uses GitHub Actions' `post:` hook mechanism for automatic cleanup:

1. **Main Run** (`src/index.ts`): Entry point that routes to either main or cleanup based on state
2. **Setup Phase** (`src/main.ts`): Handles minikube installation and configuration
3. **Cleanup Phase** (`src/cleanup.ts`): Automatically runs after job completion for restoration

### Execution Phases

#### Phase 1: Setup (src/main.ts)

```
installMinikube() → startMinikube() → waitForClusterReady()
```

**installMinikube(version)**
- Resolves 'latest', 'stable', or specific version
- Detects platform (linux/darwin) and architecture (amd64/arm64/arm)
- Downloads minikube binary from Google Cloud Storage or GitHub releases
- Installs binary to `/usr/local/bin/minikube`
- Location: `src/main.ts:40-119`

**startMinikube(kubernetesVersion, driver)**
- Starts minikube cluster with specified driver and Kubernetes version
- Configures kubeconfig
- Exports KUBECONFIG environment variable
- Location: `src/main.ts:121-159`

**waitForClusterReady(timeout)**
- Polls for cluster readiness with configurable timeout
- Checks: minikube status → kubectl connects → nodes Ready → kube-system pods running
- Shows diagnostics if timeout occurs
- Location: `src/main.ts:161-241`

#### Phase 2: Cleanup (src/cleanup.ts)

```
deleteMinikube()
```

**deleteMinikube()**
- Checks if minikube is installed
- Checks if minikube cluster exists
- Deletes minikube cluster with `minikube delete`
- Location: `src/cleanup.ts:22-49`

## File Structure

```
setup-minikube/
├── src/
│   ├── index.ts         # Entry point - routes to main or cleanup
│   ├── main.ts          # Setup phase implementation
│   └── cleanup.ts       # Cleanup phase implementation
├── dist/                # Compiled JavaScript (via @vercel/ncc)
│   ├── index.js         # Bundled main entry point
│   └── *.map            # Source maps
├── action.yml           # GitHub Action metadata and interface
├── package.json         # Node.js dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── AGENTS.md            # This file
```

## Key Technical Details

### Action Configuration (action.yml)

**Inputs:**
- `version` (default: 'stable'): minikube version to install (e.g., v1.32.0, latest, or stable)
- `kubernetes-version` (default: 'stable'): Kubernetes version to use (e.g., v1.28.3, stable, latest)
- `driver` (default: 'docker'): Driver to use (docker, none, podman)
- `wait-for-ready` (default: 'true'): Wait for minikube cluster to be ready
- `timeout` (default: '300'): Timeout in seconds for readiness check

**Outputs:**
- `kubeconfig`: Path to kubeconfig file (`~/.kube/config`)

**Runtime:**
- Node.js 24 (`node24`)
- Main entry: `dist/index.js`
- Post hook: `dist/index.js` (same file, different execution path)

### Dependencies

**Production:**
- `@actions/core`: GitHub Actions toolkit for inputs/outputs/logging
- `@actions/exec`: Execute shell commands

**Development:**
- `@vercel/ncc`: Compiles TypeScript and bundles dependencies into single file
- `typescript`: TypeScript compiler

### Build Process

```bash
npm run build  # Uses @vercel/ncc to create dist/index.js
```

**Important:** The `dist/` directory must be committed to the repository for the action to work, as GitHub Actions cannot run build steps before execution.

## State Management

The action uses `core.saveState()` and `core.getState()` to coordinate between main and cleanup phases:

```typescript
// src/main.ts - Set state during main run
core.saveState('isPost', 'true');

// src/index.ts - Check state to determine phase
if (!core.getState('isPost')) {
  // Main run
  main()
} else {
  // Post run (cleanup)
  cleanup()
}
```

## System Requirements

- **OS:** Linux or macOS (tested on ubuntu-latest)
- **Permissions:** sudo access (available by default in GitHub Actions)
- **Network:** Internet access to download minikube binaries
- **Driver Dependencies:** Docker must be installed if using docker driver (default on GitHub-hosted runners)

## Common Modification Scenarios

### Adding New Configuration Options

1. Add input to `action.yml`:
```yaml
inputs:
  new-option:
    description: 'Description of the new option'
    required: false
    default: 'default-value'
```

2. Read input in `src/main.ts`:
```typescript
const newOption = core.getInput('new-option');
```

3. Update README.md documentation

### Modifying Installation Logic

The installation logic is in `src/main.ts:40-119`. Key areas:
- Platform/architecture detection: lines 46-86
- Version resolution: lines 89-94
- Binary download and installation: lines 96-107

### Adjusting Cleanup Behavior

**CRITICAL:** Cleanup logic is in `src/cleanup.ts`. The cleanup is designed to be non-failing (uses `ignoreReturnCode: true`) to avoid breaking workflows if cleanup encounters issues.

**MANDATORY RULE:** Every modification to setup logic MUST have a corresponding cleanup operation. Review the "CRITICAL PRINCIPLE: SYSTEM STATE RESTORATION" section at the top of this document before making any changes.

## Testing Strategy

### Testing Checklist
**Setup Phase:**
- [ ] minikube installs successfully
- [ ] Cluster becomes ready within timeout
- [ ] kubectl can connect and list nodes

**Cleanup Phase (CRITICAL - MUST VERIFY):**
- [ ] Cleanup removes minikube cluster
- [ ] minikube delete command executes successfully
- [ ] No leftover processes or containers
- [ ] Minikube profile directory is cleaned up

## Debugging

### Enable Debug Logging
Set repository secret: `ACTIONS_STEP_DEBUG = true`

### Key Log Messages
- "Starting Minikube setup..." - Main phase begins
- "Minikube installed successfully" - Installation complete
- "Minikube cluster is fully ready!" - Cluster ready
- "Starting cleanup..." - Cleanup phase begins
- "Minikube cluster deleted" - Cleanup complete

### Diagnostic Information
When cluster readiness times out, `showDiagnostics()` (`src/main.ts:243-266`) displays:
- minikube status
- minikube logs (last 100 lines)
- kubectl cluster info
- Nodes status
- Kube-system pods

## Related Resources

- **minikube Project**: https://minikube.sigs.k8s.io/
- **minikube GitHub**: https://github.com/kubernetes/minikube
- **minikube Documentation**: https://minikube.sigs.k8s.io/docs/
- **GitHub Actions Documentation**: https://docs.github.com/actions
- **Node.js Actions Guide**: https://docs.github.com/actions/creating-actions/creating-a-javascript-action

## Contributing

### Development Workflow
1. Make changes to `src/*.ts`
2. **CRITICAL:** If modifying setup phase, add corresponding cleanup operations
3. Run `npm run build` to compile
4. Commit both `src/` and `dist/` changes
5. Test in a workflow on GitHub - verify BOTH setup AND cleanup work correctly
6. Test that subsequent workflows still work after your action runs
7. Create pull request

### Release Process
Releases are typically managed via tags. Tags should follow semantic versioning (e.g., v1.0.0).
