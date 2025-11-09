import * as core from '@actions/core';
import * as exec from '@actions/exec';

export async function cleanup(): Promise<void> {
  core.startGroup('Cleaning up and restoring system state');
  
  try {
    core.info('Starting cleanup...');
    
    // Stop and delete Minikube cluster
    await deleteMinikube();
    
    core.info('✓ System state restored');
  } catch (error) {
    core.warning(`Cleanup encountered errors: ${error}`);
    // Don't fail the workflow if cleanup has issues
  } finally {
    core.endGroup();
  }
}

async function deleteMinikube(): Promise<void> {
  core.info('Deleting Minikube cluster...');
  
  // Retrieve custom minikube path from state
  const minikubePath = core.getState('minikubePath');
  const customBinDir = core.getState('customBinDir');
  
  if (!minikubePath) {
    core.info('  No custom minikube installation found, skipping cleanup');
    return;
  }
  
  core.info(`  Custom minikube path: ${minikubePath}`);
  
  // Check if minikube cluster exists
  const statusResult = await exec.exec('minikube', ['status'], { 
    ignoreReturnCode: true,
    silent: true 
  });
  
  if (statusResult === 0) {
    core.info('  Deleting Minikube cluster...');
    await exec.exec('minikube', ['delete'], { ignoreReturnCode: true });
    core.info('  Minikube cluster deleted');
  } else {
    core.info('  No Minikube cluster found');
  }
  
  // Remove CNI directories created by minikube
  core.info('  Removing CNI directories...');
  await exec.exec('sudo', ['rm', '-rf', '/etc/cni'], { ignoreReturnCode: true });
  await exec.exec('sudo', ['rm', '-rf', '/opt/cni'], { ignoreReturnCode: true });
  core.info('  CNI directories removed');
  
  // Remove custom minikube binary to fully restore system state
  core.info(`  Removing custom minikube binary: ${minikubePath}`);
  await exec.exec('rm', ['-f', minikubePath], { ignoreReturnCode: true });
  core.info('  Custom minikube binary removed');
  
  // Remove custom bin directory if it's empty
  if (customBinDir) {
    core.info(`  Checking if custom bin directory is empty: ${customBinDir}`);
    const checkEmpty = await exec.exec('bash', ['-c', `[ -d "${customBinDir}" ] && [ -z "$(ls -A "${customBinDir}")" ]`], { 
      ignoreReturnCode: true,
      silent: true 
    });
    
    if (checkEmpty === 0) {
      core.info(`  Removing empty custom bin directory: ${customBinDir}`);
      await exec.exec('rmdir', [customBinDir], { ignoreReturnCode: true });
    } else {
      core.info(`  Custom bin directory not empty or doesn't exist, leaving it`);
    }
  }
}
