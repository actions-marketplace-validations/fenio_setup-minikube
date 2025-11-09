import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

export async function main(): Promise<void> {
  try {
    core.info('Starting Minikube setup...');
    
    // Set state to indicate this is not post-run
    core.saveState('isPost', 'true');
    
    // Get inputs
    const version = core.getInput('version') || 'latest';
    const kubernetesVersion = core.getInput('kubernetes-version') || 'stable';
    const driver = core.getInput('driver') || 'docker';
    const waitForReady = core.getInput('wait-for-ready') === 'true';
    const timeout = parseInt(core.getInput('timeout') || '300', 10);
    
    core.info(`Configuration: version=${version}, kubernetes-version=${kubernetesVersion}, driver=${driver}, wait-for-ready=${waitForReady}, timeout=${timeout}s`);
    
    // Step 0: Install prerequisites
    await installPrerequisites();
    
    // Step 1: Install minikube binary
    await installMinikube(version);
    
    // Step 2: Start minikube cluster
    await startMinikube(kubernetesVersion, driver);
    
    // Step 3: Wait for cluster ready (if requested)
    if (waitForReady) {
      await waitForClusterReady(timeout);
    }
    
    core.info('✓ Minikube setup completed successfully!');
  } catch (error) {
    throw error;
  }
}

async function installPrerequisites(): Promise<void> {
  core.startGroup('Installing prerequisites');
  
  try {
    core.info('Checking and installing required packages...');
    
    // Check if running on Linux
    const platform = os.platform();
    if (platform !== 'linux') {
      core.info('  Not on Linux, skipping package installation');
      return;
    }
    
    // Install conntrack (required by Minikube when using driver=none)
    core.info('  Installing conntrack...');
    const checkConntrack = await exec.exec('which', ['conntrack'], { 
      ignoreReturnCode: true,
      silent: true 
    });
    
    if (checkConntrack !== 0) {
      core.info('  conntrack not found, installing...');
      await exec.exec('sudo', ['apt-get', 'update', '-qq']);
      await exec.exec('sudo', ['apt-get', 'install', '-y', '-qq', 'conntrack']);
      core.info('  ✓ conntrack installed');
    } else {
      core.info('  ✓ conntrack already installed');
    }
    
    core.info('✓ Prerequisites installed successfully');
  } catch (error) {
    throw new Error(`Failed to install prerequisites: ${error}`);
  } finally {
    core.endGroup();
  }
}

async function installMinikube(version: string): Promise<void> {
  core.startGroup('Installing Minikube');
  
  try {
    core.info(`Installing Minikube ${version}...`);
    
    // Detect platform and architecture
    const platform = os.platform();
    const archOutput: string[] = [];
    await exec.exec('uname', ['-m'], {
      listeners: {
        stdout: (data: Buffer) => archOutput.push(data.toString())
      }
    });
    const arch = archOutput.join('').trim();
    
    // Map architecture to binary name
    let binaryArch: string;
    switch (arch) {
      case 'x86_64':
        binaryArch = 'amd64';
        break;
      case 'aarch64':
      case 'arm64':
        binaryArch = 'arm64';
        break;
      case 'armv7l':
        binaryArch = 'arm';
        break;
      default:
        throw new Error(`Unsupported architecture: ${arch}`);
    }
    
    // Map platform
    let osPlatform: string;
    switch (platform) {
      case 'linux':
        osPlatform = 'linux';
        break;
      case 'darwin':
        osPlatform = 'darwin';
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    
    core.info(`  Platform: ${osPlatform}, Architecture: ${binaryArch}`);
    
    // Construct download URL
    let downloadUrl: string;
    if (version === 'latest' || version === 'stable') {
      downloadUrl = `https://storage.googleapis.com/minikube/releases/latest/minikube-${osPlatform}-${binaryArch}`;
    } else {
      downloadUrl = `https://github.com/kubernetes/minikube/releases/download/${version}/minikube-${osPlatform}-${binaryArch}`;
    }
    
    core.info(`  Downloading from: ${downloadUrl}`);
    
    // Download binary
    const tmpBinary = '/tmp/minikube';
    await exec.exec('curl', ['-sfL', downloadUrl, '-o', tmpBinary]);
    
    // Install binary to custom location under our control
    const homeDir = os.homedir();
    const customBinDir = path.join(homeDir, '.local', 'bin');
    const minikubePath = path.join(customBinDir, 'minikube');
    
    // Create directory if it doesn't exist
    core.info(`  Creating custom bin directory: ${customBinDir}`);
    await fs.mkdir(customBinDir, { recursive: true });
    
    // Install binary to custom location
    core.info(`  Installing binary to ${minikubePath}...`);
    await exec.exec('install', ['-m', '755', tmpBinary, minikubePath]);
    
    // Add custom bin directory to PATH (prepend to ensure it takes priority)
    const currentPath = process.env.PATH || '';
    const newPath = `${customBinDir}:${currentPath}`;
    core.exportVariable('PATH', newPath);
    core.addPath(customBinDir);
    core.info(`  Added ${customBinDir} to PATH`);
    
    // Save custom paths for cleanup
    core.saveState('minikubePath', minikubePath);
    core.saveState('customBinDir', customBinDir);
    
    // Clean up temp file
    await exec.exec('rm', ['-f', tmpBinary]);
    
    // Verify installation
    core.info('  Verifying installation...');
    await exec.exec('minikube', ['version']);
    
    // Double-check we're using our custom binary
    const whichOutput: string[] = [];
    await exec.exec('which', ['minikube'], {
      listeners: {
        stdout: (data: Buffer) => whichOutput.push(data.toString())
      }
    });
    const actualPath = whichOutput.join('').trim();
    core.info(`  Using minikube from: ${actualPath}`);
    
    if (actualPath !== minikubePath) {
      core.warning(`Expected to use ${minikubePath} but found ${actualPath}`);
    }
    
    core.info('✓ Minikube installed successfully');
  } catch (error) {
    throw new Error(`Failed to install Minikube: ${error}`);
  } finally {
    core.endGroup();
  }
}

async function startMinikube(kubernetesVersion: string, driver: string): Promise<void> {
  core.startGroup('Starting Minikube cluster');
  
  try {
    core.info(`Starting Minikube cluster with driver=${driver}, kubernetes-version=${kubernetesVersion}...`);
    
    const args = ['start', '--driver', driver];
    
    // Add kubernetes version if specified
    if (kubernetesVersion !== 'stable') {
      args.push('--kubernetes-version', kubernetesVersion);
    }
    
    // Start minikube
    await exec.exec('minikube', args);
    
    // Get kubeconfig path
    const kubeconfigOutput: string[] = [];
    await exec.exec('minikube', ['kubectl', '--', 'config', 'view', '--minify', '--output', 'jsonpath={..cluster}'], {
      listeners: {
        stdout: (data: Buffer) => kubeconfigOutput.push(data.toString())
      }
    });
    
    // Export KUBECONFIG environment variable
    const homeDir = os.homedir();
    const kubeconfigPath = path.join(homeDir, '.kube', 'config');
    
    core.setOutput('kubeconfig', kubeconfigPath);
    core.exportVariable('KUBECONFIG', kubeconfigPath);
    core.info(`  KUBECONFIG exported: ${kubeconfigPath}`);
    
    core.info('✓ Minikube cluster started successfully');
  } catch (error) {
    throw new Error(`Failed to start Minikube: ${error}`);
  } finally {
    core.endGroup();
  }
}

async function waitForClusterReady(timeoutSeconds: number): Promise<void> {
  core.startGroup('Waiting for cluster ready');
  
  try {
    core.info(`Waiting for Minikube cluster to be ready (timeout: ${timeoutSeconds}s)...`);
    
    const startTime = Date.now();
    
    while (true) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      
      if (elapsed > timeoutSeconds) {
        core.error('Timeout waiting for cluster to be ready');
        await showDiagnostics();
        throw new Error('Timeout waiting for cluster to be ready');
      }
      
      // Check minikube status
      const statusResult = await exec.exec('minikube', ['status'], { 
        ignoreReturnCode: true,
        silent: true 
      });
      
      if (statusResult === 0) {
        core.info('  Minikube is running');
        
        // Check if kubectl can connect to API server
        const kubectlResult = await exec.exec('kubectl', ['cluster-info'], {
          ignoreReturnCode: true,
          silent: true
        });
        
        if (kubectlResult === 0) {
          core.info('  kubectl can connect to API server');
          
          // Check if all nodes are Ready
          const nodesReady = await exec.exec('bash', ['-c', 
            'kubectl get nodes --no-headers | grep -v " Ready "'
          ], {
            ignoreReturnCode: true,
            silent: true
          });
          
          if (nodesReady !== 0) {
            core.info('  All nodes are Ready');
            
            // Check if core pods are running
            const podsRunning = await exec.exec('bash', ['-c',
              'kubectl get pods -n kube-system --no-headers | grep -v "Running\\|Completed"'
            ], {
              ignoreReturnCode: true,
              silent: true
            });
            
            if (podsRunning !== 0) {
              core.info('  All kube-system pods are running');
              break;
            } else {
              core.info('  Some kube-system pods not running yet');
            }
          } else {
            core.info('  Some nodes not Ready yet');
          }
        } else {
          core.info('  kubectl cannot connect yet');
        }
      } else {
        core.info('  Minikube not running yet');
      }
      
      core.info(`  Cluster not ready yet, waiting... (${elapsed}/${timeoutSeconds}s)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    core.info('✓ Minikube cluster is fully ready!');
  } catch (error) {
    throw new Error(`Failed waiting for cluster: ${error}`);
  } finally {
    core.endGroup();
  }
}

async function showDiagnostics(): Promise<void> {
  core.startGroup('Diagnostic Information');
  
  try {
    core.info('=== Minikube Status ===');
    await exec.exec('minikube', ['status'], { ignoreReturnCode: true });
    
    core.info('=== Minikube Logs ===');
    await exec.exec('minikube', ['logs', '--length=100'], { ignoreReturnCode: true });
    
    core.info('=== Kubectl Cluster Info ===');
    await exec.exec('kubectl', ['cluster-info'], { ignoreReturnCode: true });
    
    core.info('=== Nodes ===');
    await exec.exec('kubectl', ['get', 'nodes', '-o', 'wide'], { ignoreReturnCode: true });
    
    core.info('=== Kube-system Pods ===');
    await exec.exec('kubectl', ['get', 'pods', '-n', 'kube-system'], { ignoreReturnCode: true });
  } catch (error) {
    core.warning(`Failed to gather diagnostics: ${error}`);
  } finally {
    core.endGroup();
  }
}
