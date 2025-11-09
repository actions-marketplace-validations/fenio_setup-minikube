import * as core from '@actions/core';
import * as exec from '@actions/exec';

export async function cleanup(): Promise<void> {
  core.startGroup('Cleaning up Minikube');
  
  try {
    core.info('Starting cleanup...');
    
    // Stop and delete Minikube cluster
    await deleteMinikube();
    
    core.info('✓ Minikube cleanup complete');
  } catch (error) {
    core.warning(`Cleanup encountered errors: ${error}`);
    // Don't fail the workflow if cleanup has issues
  } finally {
    core.endGroup();
  }
}

async function deleteMinikube(): Promise<void> {
  core.info('Deleting Minikube cluster...');
  
  // Check if minikube is installed
  const isInstalled = await exec.exec('which', ['minikube'], { 
    ignoreReturnCode: true,
    silent: true 
  });
  
  if (isInstalled !== 0) {
    core.info('  Minikube not installed, skipping cleanup');
    return;
  }
  
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
  
  // Remove minikube binary to fully restore system state
  core.info('  Removing minikube binary...');
  await exec.exec('sudo', ['rm', '-f', '/usr/local/bin/minikube'], { ignoreReturnCode: true });
  core.info('  Minikube binary removed');
}
